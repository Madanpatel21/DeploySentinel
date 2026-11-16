import {
  analyzeSqlMigration,
  analyzeSupplyChain,
  buildDigitalTwinSnapshot,
  computeDeterministicRiskScore,
  evaluateCanaryTelemetry,
  evaluatePolicies,
  investigateIncident,
  selectIntelligentTests,
  signReadinessPassport,
  simulateBlastRadius,
  detectInfraDrift,
  estimateDeploymentFinOpsDelta,
  assessChaosReadiness,
} from '@releaseguard/engine';
import { hashPassword } from '../auth/security.js';
import { config } from '../config.js';
import { recordAuditLog, supabase } from '../db/supabase.js';

async function seed() {
  console.log('Seeding ReleaseGuard Supabase schema (`releaseguard`)...');

  // Check if Acme Cloud Corp already exists (idempotent seed)
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', 'acme-cloud')
    .maybeSingle();

  if (existingOrg) {
    console.log('Seed already present for acme-cloud; skipping duplicate creation.');
    return;
  }

  // 1. Create 2 isolated Organizations
  const { data: acmeOrg } = await supabase
    .from('organizations')
    .insert({ name: 'Acme Cloud Corp', slug: 'acme-cloud', plan: 'ENTERPRISE', billing_status: 'ACTIVE' })
    .select('*')
    .single();

  const { data: betaOrg } = await supabase
    .from('organizations')
    .insert({ name: 'Beta Fintech Labs', slug: 'beta-fintech', plan: 'STARTER', billing_status: 'ACTIVE' })
    .select('*')
    .single();

  if (!acmeOrg || !betaOrg) throw new Error('Failed to create organizations');

  // 2. Create Users across RBAC roles (real bcrypt hashes)
  const demoPassHash = await hashPassword('ReleaseGuard!2026');
  const { data: users } = await supabase
    .from('users')
    .insert([
      { email: 'owner@acme.releaseguard.io', full_name: 'Elena Vance', password_hash: demoPassHash },
      { email: 'relmgr@acme.releaseguard.io', full_name: 'Marcus Sterling', password_hash: demoPassHash },
      { email: 'sre@acme.releaseguard.io', full_name: 'Priya Nair', password_hash: demoPassHash },
      { email: 'sec@acme.releaseguard.io', full_name: 'David Kim', password_hash: demoPassHash },
      { email: 'dev@acme.releaseguard.io', full_name: 'Lucas Silva', password_hash: demoPassHash },
      { email: 'auditor@acme.releaseguard.io', full_name: 'Claire Dubois', password_hash: demoPassHash },
      { email: 'beta-owner@beta.releaseguard.io', full_name: 'Omar Farooq', password_hash: demoPassHash },
    ])
    .select('*');

  if (!users || users.length < 7) throw new Error('Failed to seed users');
  const [owner, relMgr, sre, sec, dev, auditor, betaOwner] = users;

  await supabase.from('memberships').insert([
    { organization_id: acmeOrg.id, user_id: owner.id, role: 'ORG_OWNER' },
    { organization_id: acmeOrg.id, user_id: relMgr.id, role: 'RELEASE_MANAGER' },
    { organization_id: acmeOrg.id, user_id: sre.id, role: 'SRE_ONCALL' },
    { organization_id: acmeOrg.id, user_id: sec.id, role: 'SECURITY_ADMIN' },
    { organization_id: acmeOrg.id, user_id: dev.id, role: 'DEVELOPER' },
    { organization_id: acmeOrg.id, user_id: auditor.id, role: 'AUDITOR' },
    { organization_id: betaOrg.id, user_id: betaOwner.id, role: 'ORG_OWNER' },
  ]);

  // 3. Create Projects & Environments
  const { data: acmeProjects } = await supabase
    .from('projects')
    .insert([
      {
        organization_id: acmeOrg.id,
        name: 'Checkout Core API',
        slug: 'checkout-core-api',
        repo_url: 'https://github.com/acme-cloud/checkout-core-api',
        service_tier: 'TIER_0',
        auto_rollback_enabled: false,
      },
      {
        organization_id: acmeOrg.id,
        name: 'Auth & Identity Mesh',
        slug: 'auth-identity-mesh',
        repo_url: 'https://github.com/acme-cloud/auth-identity-mesh',
        service_tier: 'TIER_0',
        auto_rollback_enabled: false,
      },
      {
        organization_id: acmeOrg.id,
        name: 'Billing Ledger Worker',
        slug: 'billing-ledger-worker',
        repo_url: 'https://github.com/acme-cloud/billing-ledger-worker',
        service_tier: 'TIER_1',
        auto_rollback_enabled: false,
      },
    ])
    .select('*');

  const { data: betaProjects } = await supabase
    .from('projects')
    .insert([
      {
        organization_id: betaOrg.id,
        name: 'Beta Payment Gateway',
        slug: 'beta-payment-gateway',
        service_tier: 'TIER_0',
        auto_rollback_enabled: false,
      },
    ])
    .select('*');

  const checkoutProj = acmeProjects![0]!;
  const authProj = acmeProjects![1]!;
  const billingProj = acmeProjects![2]!;
  const betaProj = betaProjects![0]!;

  const { data: envs } = await supabase
    .from('environments')
    .insert([
      { organization_id: acmeOrg.id, project_id: checkoutProj.id, name: 'staging', tier: 'staging', risk_threshold: 75, require_approval: false, auto_rollback_enabled: false },
      { organization_id: acmeOrg.id, project_id: checkoutProj.id, name: 'production', tier: 'prod', risk_threshold: 55, require_approval: true, auto_rollback_enabled: false },
      { organization_id: acmeOrg.id, project_id: authProj.id, name: 'production', tier: 'prod', risk_threshold: 50, require_approval: true, auto_rollback_enabled: false },
      { organization_id: acmeOrg.id, project_id: billingProj.id, name: 'staging', tier: 'staging', risk_threshold: 70, require_approval: false, auto_rollback_enabled: false },
      { organization_id: betaOrg.id, project_id: betaProj.id, name: 'production', tier: 'prod', risk_threshold: 60, require_approval: true, auto_rollback_enabled: false },
    ])
    .select('*');

  const checkoutStaging = envs![0]!;
  const checkoutProd = envs![1]!;
  const authProd = envs![2]!;

  // 4. Seed Policies
  const { data: policies } = await supabase
    .from('policies')
    .insert([
      {
        organization_id: acmeOrg.id,
        name: 'Block Destructive SQL in Production',
        description: 'Requires expand-and-contract pattern and blocks unapproved DROP/TRUNCATE statements.',
        category: 'DATABASE',
        rule_dsl: { blockDestructiveSql: true },
        mode: 'enforce',
        severity: 'BLOCK',
        created_by: sec.id,
      },
      {
        organization_id: acmeOrg.id,
        name: 'Zero Critical CVEs Gate',
        description: 'Blocks production promotion if CycloneDX/SPDX SBOM contains Critical CVEs.',
        category: 'SECURITY',
        rule_dsl: { maxCriticalCves: 0, requireSbomSignature: true },
        mode: 'enforce',
        severity: 'BLOCK',
        created_by: sec.id,
      },
      {
        organization_id: acmeOrg.id,
        name: 'Production Risk Score Ceiling (75)',
        description: 'Flags releases exceeding deterministic risk score 75 for Release Manager review.',
        category: 'RISK',
        rule_dsl: { maxRiskScore: 75 },
        mode: 'enforce',
        severity: 'WARN',
        created_by: relMgr.id,
      },
    ])
    .select('*');

  // 5. Seed 3 Realistic Releases with full Engine Computation
  const scenarios = [
    {
      project: checkoutProj,
      env: checkoutProd,
      version: 'v2.14.0',
      gitSha: 'a94f3c2d81e54012a94f3c2d81e54012a94f3c2d',
      prNumber: 1482,
      title: 'Refactor idempotent payment capture & add order_audit_idx',
      description: 'Adds non-blocking index on order_events and updates checkout retry logic.',
      files: [
        { path: 'src/checkout/capture.ts', additions: 145, deletions: 42 },
        { path: 'src/payment/stripe-adapter.ts', additions: 68, deletions: 19 },
        { path: 'migrations/20261116_add_audit_idx.sql', additions: 14, deletions: 0 },
      ],
      sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_events_created ON order_events(created_at);',
      sqlFile: 'migrations/20261116_add_audit_idx.sql',
      deps: [
        { name: 'express', version: '4.21.1', license: 'MIT' },
        { name: 'zod', version: '3.23.8', license: 'MIT' },
        { name: 'axios', version: '1.7.7', license: 'MIT' },
      ],
      status: 'APPROVED',
      incidentOccurred: false,
    },
    {
      project: authProj,
      env: authProd,
      version: 'v4.3.2-rc1',
      gitSha: 'f19b82a47c309e12f19b82a47c309e12f19b82a4',
      prNumber: 904,
      title: 'Token rotation schema migration & legacy session cleanup',
      description: 'Drops legacy_tokens table and alters session_id column type.',
      files: [
        { path: 'src/auth/jwt-verifier.ts', additions: 210, deletions: 95 },
        { path: 'src/rbac/permissions.ts', additions: 88, deletions: 24 },
        { path: 'migrations/042_drop_legacy_tokens.sql', additions: 22, deletions: 0 },
      ],
      sql: 'ALTER TABLE user_sessions ALTER COLUMN session_id TYPE uuid;\nDROP TABLE legacy_tokens;',
      sqlFile: 'migrations/042_drop_legacy_tokens.sql',
      deps: [
        { name: 'jsonwebtoken', version: '8.5.1', license: 'MIT' },
        { name: 'lodash', version: '4.17.21', license: 'MIT' },
      ],
      status: 'BLOCKED',
      incidentOccurred: true,
    },
    {
      project: billingProj,
      env: checkoutStaging,
      version: 'v1.9.5',
      gitSha: '77c2d1904b8a123477c2d1904b8a123477c2d190',
      prNumber: 412,
      title: 'Add usage metering rollup worker',
      description: 'Batch aggregation for monthly billing quotas.',
      files: [
        { path: 'src/billing/rollup-worker.ts', additions: 90, deletions: 12 },
        { path: 'tests/billing.test.ts', additions: 110, deletions: 5 },
      ],
      sql: '',
      sqlFile: '',
      deps: [{ name: 'zod', version: '3.23.8', license: 'MIT' }],
      status: 'DEPLOYED',
      incidentOccurred: false,
    },
  ];

  const seededReleases: Array<{ id: string; version: string; risk_score: number; project_id: string }> = [];

  for (const s of scenarios) {
    const sqlRes = s.sql ? analyzeSqlMigration(s.sqlFile, s.sql) : null;
    const sbomRes = analyzeSupplyChain(s.deps, 'cyclonedx', 3, true, s.project.slug, s.version);
    const blast = simulateBlastRadius(s.files);
    const its = selectIntelligentTests(s.files, undefined, 50);
    const critCves = sbomRes.vulnerabilities.filter((v) => v.severity === 'CRITICAL').length;
    const highCves = sbomRes.vulnerabilities.filter((v) => v.severity === 'HIGH').length;
    const risk = computeDeterministicRiskScore({
      changedFiles: s.files,
      environmentTier: s.env.tier as 'dev' | 'staging' | 'prod',
      serviceTier: s.project.service_tier as 'TIER_0' | 'TIER_1',
      sqlLockRisk: sqlRes?.lockRisk ?? 'NONE',
      destructiveSqlOpsCount: sqlRes?.destructiveOps.length ?? 0,
      criticalCveCount: critCves,
      highCveCount: highCves,
      blastRadiusServicesCount: blast.directlyImpactedServices.length + blast.downstreamTransitiveServices.length,
      testCoverageConfidence: its.predictedCatchProb,
      activeDriftCount: s.version.includes('rc1') ? 1 : 0,
      historicalFailureRate: 0.08,
      slsaVerified: true,
    });
    const twin = buildDigitalTwinSnapshot(s.version, s.env.tier as 'dev' | 'staging' | 'prod', blast, sqlRes?.lockRisk ?? 'NONE', s.status === 'BLOCKED' ? 'BLOCK' : 'PASS');

    const { data: rel } = await supabase
      .from('releases')
      .insert({
        organization_id: acmeOrg.id,
        project_id: s.project.id,
        environment_id: s.env.id,
        version: s.version,
        git_sha: s.gitSha,
        branch: 'main',
        pr_number: s.prNumber,
        author_id: dev.id,
        author_email: dev.email,
        title: s.title,
        description: s.description,
        status: s.status,
        risk_score: risk.score,
        risk_level: risk.level,
        confidence: risk.confidence,
        completeness: risk.completeness,
        scoring_version: risk.scoringVersion,
        factor_breakdown: risk.factors,
        changed_files: s.files,
        digital_twin: twin,
        blast_radius: blast,
        idempotency_key: `seed-${s.version}`,
      })
      .select('*')
      .single();

    seededReleases.push(rel!);

    const sig = signReadinessPassport(
      {
        releaseId: rel!.id,
        organizationId: acmeOrg.id,
        version: s.version,
        gitSha: s.gitSha,
        riskScore: risk.score,
        riskLevel: risk.level,
        scoringVersion: risk.scoringVersion,
        sqlLockRisk: sqlRes?.lockRisk ?? 'NONE',
        cveCount: sbomRes.vulnerabilities.length,
        policyPassed: s.status !== 'BLOCKED',
        issuedAt: rel!.created_at,
      },
      config.PASSPORT_SIGNING_SECRET
    );
    await supabase.from('releases').update({ passport_signature: sig }).eq('id', rel!.id);

    if (sqlRes) {
      await supabase.from('sql_migration_analyses').insert({
        organization_id: acmeOrg.id,
        release_id: rel!.id,
        filename: sqlRes.filename,
        raw_sql: s.sql,
        lock_risk: sqlRes.lockRisk,
        destructive_ops: sqlRes.destructiveOps,
        findings: sqlRes.findings,
        expand_contract_plan: sqlRes.expandContractPlan,
        rollback_sql: sqlRes.rollbackSql,
        requires_manual_approval: sqlRes.requiresManualApproval,
      });
    }

    await supabase.from('sbom_artifacts').insert({
      organization_id: acmeOrg.id,
      release_id: rel!.id,
      format: sbomRes.format,
      spec_version: sbomRes.specVersion,
      components_count: sbomRes.componentsCount,
      vulnerabilities: sbomRes.vulnerabilities,
      license_violations: sbomRes.licenseViolations,
      slsa_level: sbomRes.slsaLevel,
      signature_verified: sbomRes.signatureVerified,
      document: sbomRes.document,
    });

    await supabase.from('test_selections').insert({
      organization_id: acmeOrg.id,
      release_id: rel!.id,
      strategy_version: its.strategyVersion,
      total_tests: its.totalTests,
      selected_tests: its.selectedTests,
      skipped_tests: its.skippedTests,
      mandatory_security_tests: its.mandatorySecurityTests,
      estimated_savings_pct: its.estimatedSavingsPct,
      predicted_catch_prob: its.predictedCatchProb,
    });

    const evals = evaluatePolicies(
      (policies ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        ruleDsl: p.rule_dsl,
        mode: p.mode,
        severity: p.severity,
        enabled: p.enabled,
      })),
      {
        releaseId: rel!.id,
        releaseVersion: s.version,
        environmentTier: s.env.tier as 'dev' | 'staging' | 'prod',
        riskScore: risk.score,
        destructiveSqlCount: sqlRes?.destructiveOps.length ?? 0,
        criticalCveCount: critCves,
        sbomSignatureVerified: true,
        testCatchProb: its.predictedCatchProb,
        inFreezeWindow: false,
        hasValidSodApproval: s.status === 'APPROVED',
      }
    );

    await supabase.from('policy_evaluations').insert(
      evals.map((e) => ({
        organization_id: acmeOrg.id,
        release_id: rel!.id,
        policy_id: e.policyId,
        policy_name: e.policyName,
        mode: e.mode,
        verdict: e.verdict,
        reasons: e.reasons,
        simulated: e.simulated,
      }))
    );

    if (s.status === 'APPROVED') {
      await supabase.from('approvals').insert({
        organization_id: acmeOrg.id,
        release_id: rel!.id,
        environment_id: s.env.id,
        requested_by: dev.id,
        approver_id: relMgr.id,
        decision: 'APPROVED',
        rationale: 'Verified concurrent index safety and Separation of Duties.',
        sod_verified: true,
        decided_at: new Date().toISOString(),
      });
    }

    await supabase.from('reliability_outcomes').insert({
      organization_id: acmeOrg.id,
      release_id: rel!.id,
      predicted_risk_score: risk.score,
      predicted_incident_prob: Number((risk.score / 100).toFixed(3)),
      actual_incident_occurred: s.incidentOccurred,
      feedback_delta: Number(((s.incidentOccurred ? 1 : 0) - risk.score / 100).toFixed(3)),
    });
  }

  // 6. Seed Canary Deployment + Telemetry + Incident + L2/L3 Remediation
  const baselineWin = { errorRate: 0.0021, p95LatencyMs: 112, rps: 240, cpuPct: 41, memPct: 52, restartCount: 0 };
  const canaryDegraded = { errorRate: 0.038, p95LatencyMs: 265, rps: 28, cpuPct: 78, memPct: 68, restartCount: 3 };
  const canaryVerdict = evaluateCanaryTelemetry(baselineWin, canaryDegraded, false);

  const { data: dep } = await supabase
    .from('deployments')
    .insert({
      organization_id: acmeOrg.id,
      release_id: seededReleases[0]!.id,
      project_id: checkoutProj.id,
      environment_id: checkoutProd.id,
      strategy: 'canary',
      adapter: 'argocd',
      status: 'CANARY_ACTIVE',
      traffic_pct: 10,
      baseline_metrics: baselineWin,
      canary_metrics: canaryDegraded,
      health_verdict: canaryVerdict.healthVerdict,
      rollback_recommended: canaryVerdict.rollbackRecommended,
      auto_rollback_executed: false,
    })
    .select('*')
    .single();

  await supabase.from('telemetry_snapshots').insert([
    { organization_id: acmeOrg.id, deployment_id: dep!.id, window_type: 'baseline', error_rate: baselineWin.errorRate, p95_latency_ms: baselineWin.p95LatencyMs, rps: baselineWin.rps, cpu_pct: baselineWin.cpuPct, mem_pct: baselineWin.memPct, restart_count: 0, anomaly_score: 0, anomaly_detected: false },
    { organization_id: acmeOrg.id, deployment_id: dep!.id, window_type: 'canary', error_rate: canaryDegraded.errorRate, p95_latency_ms: canaryDegraded.p95LatencyMs, rps: canaryDegraded.rps, cpu_pct: canaryDegraded.cpuPct, mem_pct: canaryDegraded.memPct, restart_count: 3, anomaly_score: canaryVerdict.anomalyScore, anomaly_detected: canaryVerdict.anomalyDetected },
  ]);

  const inv = investigateIncident({
    title: 'Checkout Canary p95 Latency & 5xx Elevation',
    severity: 'SEV2',
    releaseVersion: seededReleases[0]!.version,
    riskScore: Number(seededReleases[0]!.risk_score),
    sqlLockRisk: 'MEDIUM',
    errorRateRatio: canaryVerdict.errorRateRatio,
    latencyDeltaPct: canaryVerdict.latencyDeltaPct,
  });

  const { data: incident } = await supabase
    .from('incidents')
    .insert({
      organization_id: acmeOrg.id,
      project_id: checkoutProj.id,
      release_id: seededReleases[0]!.id,
      deployment_id: dep!.id,
      title: 'Checkout Canary p95 Latency & 5xx Elevation',
      severity: 'SEV2',
      status: 'INVESTIGATING',
      observed_evidence: inv.observedEvidence,
      causal_hypotheses: inv.causalHypotheses,
      timeline: [{ timestamp: new Date().toISOString(), event: 'Canary anomaly triggered investigation' }],
      postmortem_md: inv.postmortemMd,
      external_issue_ref: 'MRP-94',
    })
    .select('*')
    .single();

  await supabase.from('remediation_actions').insert([
    {
      organization_id: acmeOrg.id,
      incident_id: incident!.id,
      release_id: seededReleases[0]!.id,
      autonomy_level: 'L2',
      action_type: 'shift_canary_traffic_to_zero',
      title: 'Shift Canary Traffic 10% -> 0% (Human Approval Required)',
      plan: { steps: ['Drain canary ingress weight to 0%', 'Preserve pods for forensic heap dump'], requiresHumanApproval: true },
      reversibility: 'REVERSIBLE',
      status: 'PROPOSED',
    },
  ]);

  // 7. Seed Infra Drift, FinOps, DORA, Chaos, Compliance, Integrations
  const drift = detectInfraDrift(
    'terraform',
    'aws_security_group.checkout_ingress',
    { ingress_cidrs: ['10.20.0.0/16'], port: 443 },
    { ingress_cidrs: ['0.0.0.0/0'], port: 443 }
  );
  if (drift) {
    await supabase.from('infra_drifts').insert({
      organization_id: acmeOrg.id,
      project_id: checkoutProj.id,
      environment_id: checkoutProd.id,
      provider: drift.provider,
      resource_address: drift.resourceAddress,
      drift_type: drift.driftType,
      severity: drift.severity,
      public_exposure: drift.publicExposure,
      desired_state: { ingress_cidrs: ['10.20.0.0/16'], port: 443 },
      live_state: { ingress_cidrs: ['0.0.0.0/0'], port: 443 },
      patch_pr_diff: drift.patchPrDiff,
      status: 'DETECTED',
    });
  }

  const finops = estimateDeploymentFinOpsDelta({ replicasDelta: 4, vcpuPerReplica: 2, memoryGbPerReplica: 4, storageGbDelta: 50 });
  await supabase.from('finops_estimates').insert({
    organization_id: acmeOrg.id,
    project_id: checkoutProj.id,
    release_id: seededReleases[0]!.id,
    deployment_id: dep!.id,
    monthly_delta_usd: finops.monthlyDeltaUsd,
    cost_breakdown: finops.costBreakdown,
    confidence_note: finops.confidenceNote,
    source_type: finops.sourceType,
  });

  const doraDays = [
    { metric_date: '2026-11-10', deploy_count: 4, lead_time_hours: 14.2, change_failure_rate: 0.05, mttr_hours: 0.7, bottleneck_stage: 'review' },
    { metric_date: '2026-11-11', deploy_count: 6, lead_time_hours: 11.8, change_failure_rate: 0.04, mttr_hours: 0.5, bottleneck_stage: 'ci_tests' },
    { metric_date: '2026-11-12', deploy_count: 5, lead_time_hours: 12.5, change_failure_rate: 0.06, mttr_hours: 0.8, bottleneck_stage: 'review' },
    { metric_date: '2026-11-13', deploy_count: 7, lead_time_hours: 9.4, change_failure_rate: 0.03, mttr_hours: 0.4, bottleneck_stage: 'approval' },
    { metric_date: '2026-11-14', deploy_count: 3, lead_time_hours: 16.0, change_failure_rate: 0.08, mttr_hours: 0.9, bottleneck_stage: 'migration_check' },
    { metric_date: '2026-11-15', deploy_count: 5, lead_time_hours: 10.6, change_failure_rate: 0.04, mttr_hours: 0.6, bottleneck_stage: 'review' },
    { metric_date: '2026-11-16', deploy_count: 6, lead_time_hours: 10.1, change_failure_rate: 0.05, mttr_hours: 0.5, bottleneck_stage: 'review' },
  ];
  await supabase.from('dora_metrics_daily').insert(
    doraDays.map((d) => ({ organization_id: acmeOrg.id, project_id: checkoutProj.id, ...d }))
  );

  const chaos = assessChaosReadiness({
    hasCanaryStrategy: true,
    hasHealthTelemetry: true,
    hasRollbackPlan: true,
    hasSloDefined: false,
    environmentTier: 'staging',
  });
  await supabase.from('chaos_readiness').insert({
    organization_id: acmeOrg.id,
    project_id: checkoutProj.id,
    environment_id: checkoutStaging.id,
    readiness_score: chaos.readinessScore,
    gaps: chaos.gaps,
    recommended_experiments: chaos.recommendedExperiments,
    prod_blocked: chaos.prodBlocked,
  });

  await supabase.from('compliance_controls').insert([
    { organization_id: acmeOrg.id, framework: 'SOC2', control_id: 'CC8.1', title: 'Change Management Separation of Duties & Approval Evidence', status: 'COMPLIANT', evidence_count: 14, evidence_refs: ['approvals', 'audit_logs'] },
    { organization_id: acmeOrg.id, framework: 'SOC2', control_id: 'CC6.1', title: 'Logical Access RBAC & MFA Enforcement', status: 'COMPLIANT', evidence_count: 9, evidence_refs: ['memberships', 'api_keys'] },
    { organization_id: acmeOrg.id, framework: 'ISO27001', control_id: 'A.8.32', title: 'Controlled Production Change & Rollback Planning', status: 'COMPLIANT', evidence_count: 11, evidence_refs: ['releases', 'sql_migration_analyses'] },
    { organization_id: acmeOrg.id, framework: 'NIST_CSF', control_id: 'PR.DS-6', title: 'Software Supply Chain Integrity & SBOM Verification', status: 'PARTIAL', evidence_count: 3, evidence_refs: ['sbom_artifacts'] },
    { organization_id: acmeOrg.id, framework: 'OWASP_ASVS', control_id: 'V14.2', title: 'Dependency Vulnerability & Provenance Gate', status: 'COMPLIANT', evidence_count: 6, evidence_refs: ['sbom_artifacts', 'policies'] },
    { organization_id: acmeOrg.id, framework: 'SLSA', control_id: 'SLSA-L3', title: 'Verified Provenance & Signed Readiness Passport', status: 'COMPLIANT', evidence_count: 5, evidence_refs: ['releases.passport_signature'] },
    { organization_id: acmeOrg.id, framework: 'GDPR', control_id: 'Art.32', title: 'Multi-Tenant RLS Isolation & Audit Integrity', status: 'COMPLIANT', evidence_count: 12, evidence_refs: ['audit_logs', 'rls_policies'] },
  ]);

  await supabase.from('integrations').insert([
    { organization_id: acmeOrg.id, provider: 'supabase', display_name: 'Supabase PG17 Control DB', status: 'CONNECTED', config_public: { schema: 'releaseguard', rls: true }, last_sync_at: new Date().toISOString() },
    { organization_id: acmeOrg.id, provider: 'linear', display_name: 'Linear MRP Engineering', status: 'CONNECTED', config_public: { teamKey: 'MRP' }, last_sync_at: new Date().toISOString() },
    { organization_id: acmeOrg.id, provider: 'notion', display_name: 'Notion Architecture Docs', status: 'CONNECTED', config_public: { workspace: 'prog37396 Space' }, last_sync_at: new Date().toISOString() },
    { organization_id: acmeOrg.id, provider: 'github', display_name: 'GitHub Webhook & Local Git CLI', status: 'SIMULATOR', config_public: { mode: 'HMAC_WEBHOOK_PLUS_LOCAL_GIT' }, last_sync_at: new Date().toISOString() },
  ]);

  await recordAuditLog({
    organizationId: acmeOrg.id,
    actorId: owner.id,
    actorRole: 'ORG_OWNER',
    action: 'ENVIRONMENT_INITIALIZED',
    resourceType: 'organization',
    resourceId: acmeOrg.id,
    payload: { projectsSeeded: 3, releasesSeeded: 3 },
  });

  console.log('Seed completed cleanly for Acme Cloud Corp & Beta Fintech Labs.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
