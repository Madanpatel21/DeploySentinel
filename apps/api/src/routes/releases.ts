import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IngestReleaseSchema, PLAN_ENTITLEMENTS, type IngestReleaseInput } from '@releaseguard/shared';
import {
  analyzeSqlMigration,
  analyzeSupplyChain,
  buildDigitalTwinSnapshot,
  buildReleaseReplayTimeline,
  computeDeterministicRiskScore,
  evaluatePolicies,
  extractDependenciesFromPackageJson,
  generateReleaseExplanation,
  selectIntelligentTests,
  signReadinessPassport,
  simulateBlastRadius,
  verifySeparationOfDuties,
  type PolicyDefinition,
} from '@releaseguard/engine';
import { authenticateRequest, requirePermission, verifyWebhookHmac } from '../auth/security.js';
import { config } from '../config.js';
import { recordAuditLog, supabase } from '../db/supabase.js';
import { inspectLocalGitRepository } from '../services/git-inspector.js';
import { enqueueBackgroundJob } from '../services/job-worker.js';
import { broadcastOrgEvent } from '../services/sse.js';

async function executeReleaseIngestion(
  organizationId: string,
  organizationPlan: keyof typeof PLAN_ENTITLEMENTS,
  actorId: string | null,
  actorEmail: string,
  actorRole: string,
  input: IngestReleaseInput,
  ipAddress?: string
) {
  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from('releases')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();
    if (existing) {
      return { release: existing, deduplicated: true };
    }
  }

  // Enforce monthly release metering quota
  const periodYm = new Date().toISOString().slice(0, 7);
  const { data: usage } = await supabase
    .from('usage_metering')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('period_ym', periodYm)
    .maybeSingle();

  const maxReleases = PLAN_ENTITLEMENTS[organizationPlan].maxReleasesPerMonth;
  if (maxReleases !== null && (usage?.releases_count ?? 0) >= maxReleases) {
    throw Object.assign(new Error(`Monthly release quota (${maxReleases}) exceeded for plan ${organizationPlan}`), { statusCode: 402 });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', input.projectId)
    .eq('organization_id', organizationId)
    .single();
  if (!project) {
    throw Object.assign(new Error('Project not found in organization'), { statusCode: 404 });
  }

  let envRow = null;
  if (input.environmentId) {
    const { data } = await supabase
      .from('environments')
      .select('*')
      .eq('id', input.environmentId)
      .eq('organization_id', organizationId)
      .single();
    envRow = data;
  } else {
    const { data } = await supabase
      .from('environments')
      .select('*')
      .eq('project_id', project.id)
      .eq('organization_id', organizationId)
      .order('tier', { ascending: true })
      .limit(1)
      .maybeSingle();
    envRow = data;
  }
  const envTier = (envRow?.tier ?? 'staging') as 'dev' | 'staging' | 'prod';

  // 1. SQL Migration Intelligence
  const sqlResults = input.sqlMigrations.map((m) => analyzeSqlMigration(m.filename, m.sql));
  const highestSqlLock = sqlResults.reduce<'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>((acc, r) => {
    const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    return rank[r.lockRisk] > rank[acc] ? r.lockRisk : acc;
  }, 'NONE');
  const destructiveOpsCount = sqlResults.reduce((s, r) => s + r.destructiveOps.length, 0);

  // 2. Supply Chain & SBOM Analysis
  const deps = input.lockfileDependencies?.length
    ? input.lockfileDependencies
    : input.packageJson
      ? extractDependenciesFromPackageJson(input.packageJson)
      : [];
  const sbomResult = analyzeSupplyChain(deps, 'cyclonedx', input.slsaLevel, input.signatureVerified, project.slug, input.version);
  const criticalCves = sbomResult.vulnerabilities.filter((v) => v.severity === 'CRITICAL').length;
  const highCves = sbomResult.vulnerabilities.filter((v) => v.severity === 'HIGH').length;

  // 3. Blast Radius & Change Impact
  const blast = simulateBlastRadius(input.changedFiles);

  // 4. Active Drift & Historical Failure context
  const [{ count: activeDrifts }, { data: histOutcomes }] = await Promise.all([
    supabase.from('infra_drifts').select('id', { count: 'exact', head: true }).eq('project_id', project.id).eq('status', 'DETECTED'),
    supabase.from('reliability_outcomes').select('actual_incident_occurred').eq('organization_id', organizationId).limit(30),
  ]);

  const histRate = histOutcomes && histOutcomes.length > 0
    ? histOutcomes.filter((o) => o.actual_incident_occurred).length / histOutcomes.length
    : 0.06;

  // 5. Intelligent Test Selection (preliminary + risk-adjusted)
  const preliminaryIts = selectIntelligentTests(input.changedFiles, input.availableTests, 50);

  // 6. Deterministic Risk Score v2.1.0
  const risk = computeDeterministicRiskScore({
    changedFiles: input.changedFiles,
    environmentTier: envTier,
    serviceTier: project.service_tier,
    sqlLockRisk: highestSqlLock,
    destructiveSqlOpsCount: destructiveOpsCount,
    criticalCveCount: criticalCves,
    highCveCount: highCves,
    blastRadiusServicesCount: blast.directlyImpactedServices.length + blast.downstreamTransitiveServices.length,
    testCoverageConfidence: preliminaryIts.predictedCatchProb,
    activeDriftCount: activeDrifts ?? 0,
    historicalFailureRate: histRate,
    slsaVerified: input.signatureVerified,
  });

  const finalIts = selectIntelligentTests(input.changedFiles, input.availableTests, risk.score);

  // 7. Policy-as-Code Evaluation
  const { data: orgPolicies } = await supabase
    .from('policies')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('enabled', true);

  const policyDefs: PolicyDefinition[] = (orgPolicies ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    ruleDsl: p.rule_dsl,
    mode: p.mode,
    severity: p.severity,
    enabled: p.enabled,
  }));

  const policyEvals = evaluatePolicies(policyDefs, {
    releaseId: 'pending',
    releaseVersion: input.version,
    environmentTier: envTier,
    riskScore: risk.score,
    destructiveSqlCount: destructiveOpsCount,
    criticalCveCount: criticalCves,
    sbomSignatureVerified: input.signatureVerified,
    testCatchProb: finalIts.predictedCatchProb,
    inFreezeWindow: false,
    hasValidSodApproval: false,
  });

  const enforcedBlock = policyEvals.some((e) => !e.simulated && e.verdict === 'BLOCK');
  const policyForecast = enforcedBlock ? 'BLOCK' : policyEvals.some((e) => e.verdict === 'WARN') ? 'WARN' : 'PASS';
  const digitalTwin = buildDigitalTwinSnapshot(input.version, envTier, blast, highestSqlLock, policyForecast);

  const status = enforcedBlock
    ? 'BLOCKED'
    : risk.requiresManualApproval || envRow?.require_approval
      ? 'AWAITING_APPROVAL'
      : 'APPROVED';

  const { data: release, error: relErr } = await supabase
    .from('releases')
    .insert({
      organization_id: organizationId,
      project_id: project.id,
      environment_id: envRow?.id ?? null,
      version: input.version,
      git_sha: input.gitSha,
      branch: input.branch,
      pr_number: input.prNumber ?? null,
      author_id: actorId,
      author_email: actorEmail,
      title: input.title,
      description: input.description,
      status,
      risk_score: risk.score,
      risk_level: risk.level,
      confidence: risk.confidence,
      completeness: risk.completeness,
      scoring_version: risk.scoringVersion,
      factor_breakdown: risk.factors,
      changed_files: input.changedFiles,
      digital_twin: digitalTwin,
      blast_radius: blast,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select('*')
    .single();

  if (relErr) throw new Error(relErr.message);

  // Sign cryptographic Deployment Readiness Passport
  const passportSig = signReadinessPassport(
    {
      releaseId: release.id,
      organizationId,
      version: release.version,
      gitSha: release.git_sha,
      riskScore: Number(release.risk_score),
      riskLevel: release.risk_level,
      scoringVersion: release.scoring_version,
      sqlLockRisk: highestSqlLock,
      cveCount: sbomResult.vulnerabilities.length,
      policyPassed: !enforcedBlock,
      issuedAt: release.created_at,
    },
    config.PASSPORT_SIGNING_SECRET
  );
  await supabase.from('releases').update({ passport_signature: passportSig }).eq('id', release.id);
  release.passport_signature = passportSig;

  // Persist sub-artifacts
  if (sqlResults.length > 0) {
    await supabase.from('sql_migration_analyses').insert(
      sqlResults.map((r, idx) => ({
        organization_id: organizationId,
        release_id: release.id,
        filename: r.filename,
        raw_sql: input.sqlMigrations[idx]!.sql,
        lock_risk: r.lockRisk,
        destructive_ops: r.destructiveOps,
        findings: r.findings,
        expand_contract_plan: r.expandContractPlan,
        rollback_sql: r.rollbackSql,
        requires_manual_approval: r.requiresManualApproval,
      }))
    );
  }

  await supabase.from('sbom_artifacts').insert({
    organization_id: organizationId,
    release_id: release.id,
    format: sbomResult.format,
    spec_version: sbomResult.specVersion,
    components_count: sbomResult.componentsCount,
    vulnerabilities: sbomResult.vulnerabilities,
    license_violations: sbomResult.licenseViolations,
    slsa_level: sbomResult.slsaLevel,
    signature_verified: sbomResult.signatureVerified,
    document: sbomResult.document,
  });

  await supabase.from('test_selections').insert({
    organization_id: organizationId,
    release_id: release.id,
    strategy_version: finalIts.strategyVersion,
    total_tests: finalIts.totalTests,
    selected_tests: finalIts.selectedTests,
    skipped_tests: finalIts.skippedTests,
    mandatory_security_tests: finalIts.mandatorySecurityTests,
    estimated_savings_pct: finalIts.estimatedSavingsPct,
    predicted_catch_prob: finalIts.predictedCatchProb,
  });

  if (policyEvals.length > 0) {
    await supabase.from('policy_evaluations').insert(
      policyEvals.map((e) => ({
        organization_id: organizationId,
        release_id: release.id,
        policy_id: e.policyId,
        policy_name: e.policyName,
        mode: e.mode,
        verdict: e.verdict,
        reasons: e.reasons,
        simulated: e.simulated,
      }))
    );
  }

  if (status === 'AWAITING_APPROVAL') {
    await supabase.from('approvals').insert({
      organization_id: organizationId,
      release_id: release.id,
      environment_id: envRow?.id ?? null,
      requested_by: actorId,
      decision: 'PENDING',
    });
  }

  // Update metering
  await supabase.from('usage_metering').upsert(
    {
      organization_id: organizationId,
      period_ym: periodYm,
      releases_count: (usage?.releases_count ?? 0) + 1,
      deployments_count: usage?.deployments_count ?? 0,
      sbom_scans_count: (usage?.sbom_scans_count ?? 0) + 1,
      ai_tokens_used: usage?.ai_tokens_used ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,period_ym' }
  );

  await enqueueBackgroundJob(organizationId, 'RELEASE_POST_INGEST_INDEX', { releaseId: release.id });
  await recordAuditLog({
    organizationId,
    actorId,
    actorRole,
    action: 'RELEASE_INGESTED',
    resourceType: 'release',
    resourceId: release.id,
    payload: { version: release.version, riskScore: release.risk_score, riskLevel: release.risk_level, status },
    ipAddress,
  });

  broadcastOrgEvent(organizationId, 'release.ingested', {
    releaseId: release.id,
    version: release.version,
    riskScore: release.risk_score,
    riskLevel: release.risk_level,
    status,
  });

  return { release, deduplicated: false };
}

export async function releaseRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: [authenticateRequest, requirePermission('projects:read')] }, async (req) => {
    const { data } = await supabase
      .from('projects')
      .select('*, environments(*)')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false });
    return { projects: data ?? [] };
  });

  app.post('/projects', { preHandler: [authenticateRequest, requirePermission('projects:write')] }, async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({
      name: z.string().min(2).max(100),
      repoUrl: z.string().default(''),
      defaultBranch: z.string().default('main'),
      serviceTier: z.enum(['TIER_0', 'TIER_1', 'TIER_2', 'TIER_3']).default('TIER_1'),
    }).parse(req.body);

    const maxProjects = PLAN_ENTITLEMENTS[auth.organizationPlan].maxProjects;
    const { count } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', auth.organizationId);
    if (maxProjects !== null && (count ?? 0) >= maxProjects) {
      return reply.code(402).send({ error: `Project quota (${maxProjects}) reached for ${auth.organizationPlan} plan` });
    }

    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        organization_id: auth.organizationId,
        name: body.name,
        slug,
        repo_url: body.repoUrl,
        default_branch: body.defaultBranch,
        service_tier: body.serviceTier,
        auto_rollback_enabled: false,
      })
      .select('*')
      .single();

    if (error) return reply.code(400).send({ error: error.message });

    await supabase.from('environments').insert([
      { organization_id: auth.organizationId, project_id: project.id, name: 'dev', tier: 'dev', risk_threshold: 85, require_approval: false, auto_rollback_enabled: false },
      { organization_id: auth.organizationId, project_id: project.id, name: 'staging', tier: 'staging', risk_threshold: 70, require_approval: false, auto_rollback_enabled: false },
      { organization_id: auth.organizationId, project_id: project.id, name: 'production', tier: 'prod', risk_threshold: 55, require_approval: true, auto_rollback_enabled: false },
    ]);

    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'PROJECT_CREATED',
      resourceType: 'project',
      resourceId: project.id,
      payload: { slug },
      ipAddress: req.ip,
    });

    return reply.code(201).send({ project });
  });

  // Real local Git CLI repository scanner
  app.post('/projects/scan-local-repo', { preHandler: [authenticateRequest, requirePermission('releases:ingest')] }, async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({
      projectId: z.string().uuid(),
      repoPath: z.string().default('/home/user/releaseguard'),
      version: z.string().optional(),
    }).parse(req.body);

    const inspection = await inspectLocalGitRepository(body.repoPath);
    const result = await executeReleaseIngestion(
      auth.organizationId,
      auth.organizationPlan,
      auth.userId,
      inspection.commitAuthorEmail,
      auth.role,
      {
        projectId: body.projectId,
        version: body.version ?? `git-${inspection.headSha.slice(0, 7)}`,
        gitSha: inspection.headSha,
        branch: inspection.branch,
        title: inspection.commitTitle,
        description: `Scanned directly from local Git repository at ${inspection.repoPath}`,
        changedFiles: inspection.changedFiles,
        sqlMigrations: inspection.sqlFiles,
        packageJson: inspection.packageJson,
        slsaLevel: 2,
        signatureVerified: true,
      },
      req.ip
    );

    return reply.code(201).send({ inspection, ...result });
  });

  app.get('/releases', { preHandler: [authenticateRequest, requirePermission('releases:read')] }, async (req) => {
    const q = req.query as Record<string, string>;
    let query = supabase
      .from('releases')
      .select('*, projects(name, slug, service_tier), environments(name, tier)')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (q.projectId) query = query.eq('project_id', q.projectId);
    if (q.riskLevel) query = query.eq('risk_level', q.riskLevel);
    if (q.status) query = query.eq('status', q.status);

    const { data } = await query;
    return { releases: data ?? [] };
  });

  app.post('/releases/ingest', { preHandler: [authenticateRequest, requirePermission('releases:ingest')] }, async (req, reply) => {
    const auth = req.auth!;
    const input = IngestReleaseSchema.parse(req.body);
    try {
      const res = await executeReleaseIngestion(
        auth.organizationId,
        auth.organizationPlan,
        auth.userId,
        auth.email,
        auth.role,
        input,
        req.ip
      );
      return reply.code(res.deduplicated ? 200 : 201).send(res);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.message });
    }
  });

  // HMAC-SHA256 verified GitHub/CI Webhook receiver
  app.post('/webhooks/github', async (req, reply) => {
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = JSON.stringify(req.body);
    if (!verifyWebhookHmac(rawBody, sig, config.WEBHOOK_SIGNING_SECRET)) {
      return reply.code(401).send({ error: 'Invalid webhook HMAC-SHA256 signature' });
    }
    const body = z.object({
      organizationId: z.string().uuid(),
      release: IngestReleaseSchema,
    }).parse(req.body);

    const { data: org } = await supabase.from('organizations').select('plan').eq('id', body.organizationId).single();
    if (!org) return reply.code(404).send({ error: 'Organization not found' });

    const res = await executeReleaseIngestion(
      body.organizationId,
      org.plan,
      null,
      'ci-webhook@releaseguard.io',
      'WEBHOOK',
      body.release,
      req.ip
    );
    return reply.code(202).send(res);
  });

  app.get('/releases/:id', { preHandler: [authenticateRequest, requirePermission('releases:read')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const orgId = req.auth!.organizationId;

    const { data: release } = await supabase
      .from('releases')
      .select('*, projects(name, slug, service_tier), environments(name, tier, risk_threshold)')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (!release) return reply.code(404).send({ error: 'Release not found' });

    const [sqlRes, sbomRes, itsRes, polRes, appRes, depRes] = await Promise.all([
      supabase.from('sql_migration_analyses').select('*').eq('release_id', id).eq('organization_id', orgId),
      supabase.from('sbom_artifacts').select('*').eq('release_id', id).eq('organization_id', orgId),
      supabase.from('test_selections').select('*').eq('release_id', id).eq('organization_id', orgId),
      supabase.from('policy_evaluations').select('*').eq('release_id', id).eq('organization_id', orgId),
      supabase.from('approvals').select('*, users:approver_id(email, full_name)').eq('release_id', id).eq('organization_id', orgId),
      supabase.from('deployments').select('*').eq('release_id', id).eq('organization_id', orgId),
    ]);

    return {
      release,
      sqlMigrations: sqlRes.data ?? [],
      sboms: sbomRes.data ?? [],
      testSelections: itsRes.data ?? [],
      policyEvaluations: polRes.data ?? [],
      approvals: appRes.data ?? [],
      deployments: depRes.data ?? [],
    };
  });

  app.post('/releases/:id/approve', { preHandler: authenticateRequest }, async (req, reply) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const body = z.object({
      decision: z.enum(['APPROVED', 'REJECTED', 'WAIVED']),
      rationale: z.string().min(3).max(1000),
    }).parse(req.body);

    const { data: release } = await supabase
      .from('releases')
      .select('*, environments(tier)')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .single();
    if (!release) return reply.code(404).send({ error: 'Release not found' });

    const envTier = (release.environments as { tier?: string } | null)?.tier ?? 'staging';
    const requiredPerm = envTier === 'prod' ? 'releases:approve_prod' : 'releases:approve_nonprod';
    const permCheck = requirePermission(requiredPerm);
    await permCheck(req, reply);
    if (reply.sent) return;

    const sod = verifySeparationOfDuties(release.author_id, release.author_email, auth.userId, auth.email);
    if (!sod.valid && body.decision === 'APPROVED') {
      return reply.code(403).send({ error: sod.reason });
    }

    const { data: approval } = await supabase
      .from('approvals')
      .insert({
        organization_id: auth.organizationId,
        release_id: id,
        environment_id: release.environment_id,
        requested_by: release.author_id,
        approver_id: auth.userId,
        decision: body.decision,
        rationale: body.rationale,
        sod_verified: sod.valid,
        decided_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    const nextStatus = body.decision === 'APPROVED' || body.decision === 'WAIVED' ? 'APPROVED' : 'BLOCKED';
    await supabase.from('releases').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', id);

    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: `RELEASE_${body.decision}`,
      resourceType: 'release',
      resourceId: id,
      payload: { rationale: body.rationale, sodVerified: sod.valid },
      ipAddress: req.ip,
    });

    broadcastOrgEvent(auth.organizationId, 'release.approved', { releaseId: id, decision: body.decision, status: nextStatus });

    return { approval, releaseStatus: nextStatus, sod };
  });

  app.post('/releases/:id/explain', { preHandler: [authenticateRequest, requirePermission('releases:read')] }, async (req, reply) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const { data: release } = await supabase
      .from('releases')
      .select('*')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .single();
    if (!release) return reply.code(404).send({ error: 'Release not found' });

    const [{ data: sqls }, { data: sboms }] = await Promise.all([
      supabase.from('sql_migration_analyses').select('lock_risk').eq('release_id', id),
      supabase.from('sbom_artifacts').select('vulnerabilities').eq('release_id', id),
    ]);

    const cveCount = (sboms ?? []).reduce((s, b) => s + ((b.vulnerabilities as unknown[])?.length ?? 0), 0);
    const sqlRisk = sqls?.[0]?.lock_risk ?? 'NONE';
    const topFactors = ((release.factor_breakdown as Array<{ dimension: string; contribution: number }>) ?? [])
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map((f) => `${f.dimension} (+${f.contribution})`);

    const explanation = await generateReleaseExplanation({
      title: release.title,
      description: release.description,
      riskScore: Number(release.risk_score),
      riskLevel: release.risk_level,
      topFactors,
      sqlLockRisk: sqlRisk,
      cveCount,
      provider: config.AI_PROVIDER,
      apiKey: config.OPENAI_API_KEY,
    });

    return { explanation };
  });

  app.get('/releases/:id/replay', { preHandler: [authenticateRequest, requirePermission('releases:read')] }, async (req, reply) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const { data: release } = await supabase.from('releases').select('*').eq('id', id).eq('organization_id', auth.organizationId).single();
    if (!release) return reply.code(404).send({ error: 'Release not found' });

    const [sqls, sboms, policies, deps, incs, rems] = await Promise.all([
      supabase.from('sql_migration_analyses').select('lock_risk').eq('release_id', id),
      supabase.from('sbom_artifacts').select('vulnerabilities').eq('release_id', id),
      supabase.from('policy_evaluations').select('policy_name, verdict').eq('release_id', id),
      supabase.from('deployments').select('*').eq('release_id', id).order('started_at', { ascending: false }).limit(1),
      supabase.from('incidents').select('*').eq('release_id', id).order('detected_at', { ascending: false }).limit(1),
      supabase.from('remediation_actions').select('*').eq('release_id', id).order('created_at', { ascending: false }).limit(1),
    ]);

    const timeline = buildReleaseReplayTimeline({
      releaseVersion: release.version,
      createdAt: release.created_at,
      riskScore: Number(release.risk_score),
      riskLevel: release.risk_level,
      sqlLockRisk: sqls.data?.[0]?.lock_risk,
      cveCount: (sboms.data ?? []).reduce((s, b) => s + ((b.vulnerabilities as unknown[])?.length ?? 0), 0),
      policyVerdicts: (policies.data ?? []).map((p) => ({ policyName: p.policy_name, verdict: p.verdict })),
      deploymentStartedAt: deps.data?.[0]?.started_at,
      healthVerdict: deps.data?.[0]?.health_verdict,
      incidentTitle: incs.data?.[0]?.title,
      incidentDetectedAt: incs.data?.[0]?.detected_at,
      remediationTitle: rems.data?.[0]?.title,
      remediationAt: rems.data?.[0]?.created_at,
    });

    return { releaseId: id, version: release.version, timeline };
  });

  app.get('/sql-migrations', { preHandler: [authenticateRequest, requirePermission('releases:read')] }, async (req) => {
    const { data } = await supabase
      .from('sql_migration_analyses')
      .select('*, releases(version, title, status)')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false });
    return { migrations: data ?? [] };
  });

  app.post('/sql-migrations/analyze', { preHandler: [authenticateRequest, requirePermission('releases:ingest')] }, async (req) => {
    const body = z.object({ filename: z.string().min(1), sql: z.string().min(1) }).parse(req.body);
    return { analysis: analyzeSqlMigration(body.filename, body.sql) };
  });

  app.post('/sql-migrations/:id/approve', { preHandler: [authenticateRequest, requirePermission('migrations:approve')] }, async (req, reply) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const { data, error } = await supabase
      .from('sql_migration_analyses')
      .update({ approved_by: auth.userId, approved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .select('*')
      .single();
    if (error || !data) return reply.code(404).send({ error: 'SQL migration analysis not found' });

    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'SQL_MIGRATION_APPROVED',
      resourceType: 'sql_migration',
      resourceId: id,
      ipAddress: req.ip,
    });
    return { migration: data };
  });

  app.get('/sboms', { preHandler: [authenticateRequest, requirePermission('sbom:read')] }, async (req) => {
    const { data } = await supabase
      .from('sbom_artifacts')
      .select('*, releases(version, title)')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false });
    return { sboms: data ?? [] };
  });

  app.post('/sboms/analyze', { preHandler: [authenticateRequest, requirePermission('sbom:write')] }, async (req) => {
    const body = z.object({
      format: z.enum(['cyclonedx', 'spdx']).default('cyclonedx'),
      dependencies: z.array(z.object({
        name: z.string(),
        version: z.string(),
        license: z.string().optional(),
      })),
      slsaLevel: z.number().int().min(0).max(4).default(2),
      signatureVerified: z.boolean().default(true),
    }).parse(req.body);
    return { sbom: analyzeSupplyChain(body.dependencies, body.format, body.slsaLevel, body.signatureVerified) };
  });

  app.get('/test-selections', { preHandler: [authenticateRequest, requirePermission('releases:read')] }, async (req) => {
    const { data } = await supabase
      .from('test_selections')
      .select('*, releases(version, title, risk_score)')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false });
    return { testSelections: data ?? [] };
  });
}
