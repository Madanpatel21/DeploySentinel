import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  evaluateCanaryTelemetry,
  investigateIncident,
  simulatePolicyImpact,
  validateRemediationAction,
  type PolicyDefinition,
  type PolicyEvalContext,
} from '@deploysentinel/engine';
import { authenticateRequest, requirePermission } from '../auth/security.js';
import { recordAuditLog, supabase } from '../db/supabase.js';
import { broadcastOrgEvent } from '../services/sse.js';

export async function governanceRoutes(app: FastifyInstance) {
  // Policies & Simulation Mode
  app.get('/policies', { preHandler: [authenticateRequest, requirePermission('policies:read')] }, async (req) => {
    const { data } = await supabase
      .from('policies')
      .select('*')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false });
    return { policies: data ?? [] };
  });

  app.post('/policies', { preHandler: [authenticateRequest, requirePermission('policies:write')] }, async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({
      name: z.string().min(2).max(120),
      description: z.string().default(''),
      category: z.enum(['RISK', 'SECURITY', 'DATABASE', 'GOVERNANCE', 'FINOPS', 'COMPLIANCE']),
      ruleDsl: z.record(z.unknown()),
      mode: z.enum(['enforce', 'simulate']).default('enforce'),
      severity: z.enum(['WARN', 'BLOCK']).default('BLOCK'),
    }).parse(req.body);

    const { data, error } = await supabase
      .from('policies')
      .insert({
        organization_id: auth.organizationId,
        name: body.name,
        description: body.description,
        category: body.category,
        rule_dsl: body.ruleDsl,
        mode: body.mode,
        severity: body.severity,
        created_by: auth.userId,
      })
      .select('*')
      .single();

    if (error) return reply.code(400).send({ error: error.message });

    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'POLICY_CREATED',
      resourceType: 'policy',
      resourceId: data.id,
      payload: { name: body.name, mode: body.mode },
      ipAddress: req.ip,
    });
    return reply.code(201).send({ policy: data });
  });

  app.post('/policies/simulate', { preHandler: [authenticateRequest, requirePermission('policies:simulate')] }, async (req) => {
    const auth = req.auth!;
    const body = z.object({
      name: z.string().default('Simulated Policy'),
      category: z.enum(['RISK', 'SECURITY', 'DATABASE', 'GOVERNANCE', 'FINOPS', 'COMPLIANCE']).default('RISK'),
      ruleDsl: z.record(z.unknown()),
      severity: z.enum(['WARN', 'BLOCK']).default('BLOCK'),
    }).parse(req.body);

    const [{ data: releases }, { data: evals }] = await Promise.all([
      supabase
        .from('releases')
        .select('id, version, risk_score, environments(tier), sql_migration_analyses(destructive_ops), sbom_artifacts(vulnerabilities, signature_verified), test_selections(predicted_catch_prob)')
        .eq('organization_id', auth.organizationId)
        .limit(100),
      supabase
        .from('policy_evaluations')
        .select('release_id, policy_id, policy_name, mode, verdict, reasons, simulated')
        .eq('organization_id', auth.organizationId),
    ]);

    const contexts: PolicyEvalContext[] = (releases ?? []).map((r) => {
      const sqls = (r.sql_migration_analyses as Array<{ destructive_ops: unknown[] }>) ?? [];
      const sboms = (r.sbom_artifacts as Array<{ vulnerabilities: Array<{ severity: string }>; signature_verified: boolean }>) ?? [];
      const its = (r.test_selections as Array<{ predicted_catch_prob: number }>) ?? [];
      return {
        releaseId: r.id,
        releaseVersion: r.version,
        environmentTier: ((r.environments as { tier?: string } | null)?.tier ?? 'staging') as 'dev' | 'staging' | 'prod',
        riskScore: Number(r.risk_score),
        destructiveSqlCount: sqls.reduce((s, m) => s + (m.destructive_ops?.length ?? 0), 0),
        criticalCveCount: sboms.reduce((s, b) => s + (b.vulnerabilities?.filter((v) => v.severity === 'CRITICAL').length ?? 0), 0),
        sbomSignatureVerified: sboms.every((b) => b.signature_verified !== false),
        testCatchProb: its[0]?.predicted_catch_prob ?? 0.94,
        inFreezeWindow: false,
        hasValidSodApproval: false,
      };
    });

    const grouped: Record<string, Array<{ policyId: string; policyName: string; mode: 'enforce' | 'simulate'; verdict: 'PASS' | 'WARN' | 'BLOCK'; reasons: string[]; simulated: boolean }>> = {};
    for (const e of evals ?? []) {
      const arr = grouped[e.release_id] ?? [];
      arr.push({
        policyId: e.policy_id ?? 'unknown',
        policyName: e.policy_name,
        mode: e.mode,
        verdict: e.verdict,
        reasons: (e.reasons as string[]) ?? [],
        simulated: e.simulated,
      });
      grouped[e.release_id] = arr;
    }

    const candidate: PolicyDefinition = {
      id: 'sim-candidate',
      name: body.name,
      category: body.category,
      ruleDsl: body.ruleDsl as PolicyDefinition['ruleDsl'],
      mode: 'simulate',
      severity: body.severity,
      enabled: true,
    };

    return { simulation: simulatePolicyImpact(candidate, contexts, grouped) };
  });

  // Deployments & Canary Statistical Verification
  app.get('/deployments', { preHandler: [authenticateRequest, requirePermission('projects:read')] }, async (req) => {
    const { data } = await supabase
      .from('deployments')
      .select('*, releases(version, title, risk_score, risk_level), projects(name, slug), environments(name, tier, auto_rollback_enabled)')
      .eq('organization_id', req.auth!.organizationId)
      .order('started_at', { ascending: false })
      .limit(100);
    return { deployments: data ?? [] };
  });

  app.post('/deployments', { preHandler: [authenticateRequest, requirePermission('deployments:trigger')] }, async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({
      releaseId: z.string().uuid(),
      environmentId: z.string().uuid().optional(),
      strategy: z.enum(['rolling', 'canary', 'blue_green']).default('canary'),
      adapter: z.enum(['github', 'gitlab', 'jenkins', 'circleci', 'argocd', 'k8s', 'docker', 'vercel']).default('github'),
    }).parse(req.body);

    const { data: release } = await supabase
      .from('releases')
      .select('*')
      .eq('id', body.releaseId)
      .eq('organization_id', auth.organizationId)
      .single();
    if (!release) return reply.code(404).send({ error: 'Release not found' });
    if (release.status === 'BLOCKED' || release.status === 'AWAITING_APPROVAL') {
      return reply.code(409).send({ error: `Cannot deploy release in status '${release.status}' until governance approvals pass.` });
    }

    const envId = body.environmentId ?? release.environment_id;
    if (!envId) return reply.code(400).send({ error: 'Target environmentId is required' });

    const { data: deployment, error } = await supabase
      .from('deployments')
      .insert({
        organization_id: auth.organizationId,
        release_id: release.id,
        project_id: release.project_id,
        environment_id: envId,
        strategy: body.strategy,
        adapter: body.adapter,
        status: body.strategy === 'canary' ? 'CANARY_ACTIVE' : 'HEALTHY',
        traffic_pct: body.strategy === 'canary' ? 10 : 100,
        baseline_metrics: { errorRate: 0.002, p95LatencyMs: 115, rps: 140, cpuPct: 42, memPct: 54, restartCount: 0 },
        canary_metrics: { errorRate: 0.0022, p95LatencyMs: 118, rps: 15, cpuPct: 44, memPct: 55, restartCount: 0 },
        health_verdict: 'HEALTHY',
        rollback_recommended: false,
        auto_rollback_executed: false,
      })
      .select('*')
      .single();

    if (error) return reply.code(400).send({ error: error.message });

    await supabase.from('releases').update({ status: 'DEPLOYING' }).eq('id', release.id);
    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'DEPLOYMENT_STARTED',
      resourceType: 'deployment',
      resourceId: deployment.id,
      payload: { strategy: body.strategy, adapter: body.adapter },
      ipAddress: req.ip,
    });
    broadcastOrgEvent(auth.organizationId, 'deployment.started', { deploymentId: deployment.id, releaseId: release.id });
    return reply.code(201).send({ deployment });
  });

  app.post('/deployments/:id/telemetry', { preHandler: [authenticateRequest, requirePermission('deployments:trigger')] }, async (req, reply) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const body = z.object({
      baseline: z.object({
        errorRate: z.number().min(0).max(1),
        p95LatencyMs: z.number().positive(),
        rps: z.number().min(0),
        cpuPct: z.number().min(0).max(100),
        memPct: z.number().min(0).max(100),
        restartCount: z.number().int().min(0),
      }),
      canary: z.object({
        errorRate: z.number().min(0).max(1),
        p95LatencyMs: z.number().positive(),
        rps: z.number().min(0),
        cpuPct: z.number().min(0).max(100),
        memPct: z.number().min(0).max(100),
        restartCount: z.number().int().min(0),
      }),
    }).parse(req.body);

    const { data: dep } = await supabase
      .from('deployments')
      .select('*, environments(auto_rollback_enabled)')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .single();
    if (!dep) return reply.code(404).send({ error: 'Deployment not found' });

    const autoEnabled = Boolean((dep.environments as { auto_rollback_enabled?: boolean } | null)?.auto_rollback_enabled);
    const verdict = evaluateCanaryTelemetry(body.baseline, body.canary, autoEnabled);

    await supabase.from('telemetry_snapshots').insert([
      { organization_id: auth.organizationId, deployment_id: id, window_type: 'baseline', ...toSnakeMetrics(body.baseline), anomaly_score: 0, anomaly_detected: false },
      { organization_id: auth.organizationId, deployment_id: id, window_type: 'canary', ...toSnakeMetrics(body.canary), anomaly_score: verdict.anomalyScore, anomaly_detected: verdict.anomalyDetected },
    ]);

    const nextStatus = verdict.healthVerdict === 'HEALTHY' ? 'CANARY_ACTIVE' : 'DEGRADED';
    await supabase
      .from('deployments')
      .update({
        baseline_metrics: body.baseline,
        canary_metrics: body.canary,
        health_verdict: verdict.healthVerdict,
        rollback_recommended: verdict.rollbackRecommended,
        auto_rollback_executed: verdict.autoRollbackExecuted,
        status: nextStatus,
      })
      .eq('id', id);

    broadcastOrgEvent(auth.organizationId, 'deployment.telemetry', { deploymentId: id, verdict });
    return { verdict };
  });

  app.post('/deployments/:id/promote', { preHandler: [authenticateRequest, requirePermission('deployments:promote')] }, async (req, reply) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const { data: dep } = await supabase
      .from('deployments')
      .update({ status: 'PROMOTED', traffic_pct: 100, completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .select('*')
      .single();
    if (!dep) return reply.code(404).send({ error: 'Deployment not found' });

    await supabase.from('releases').update({ status: 'DEPLOYED' }).eq('id', dep.release_id);
    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'DEPLOYMENT_PROMOTED',
      resourceType: 'deployment',
      resourceId: id,
      ipAddress: req.ip,
    });
    return { deployment: dep };
  });

  app.post('/deployments/:id/rollback', { preHandler: [authenticateRequest, requirePermission('deployments:rollback')] }, async (req, reply) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const body = z.object({ rationale: z.string().min(3).default('Operator-initiated safety rollback') }).parse(req.body ?? {});

    const { data: dep } = await supabase
      .from('deployments')
      .update({ status: 'ROLLED_BACK', traffic_pct: 0, completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .select('*')
      .single();
    if (!dep) return reply.code(404).send({ error: 'Deployment not found' });

    await supabase.from('releases').update({ status: 'ROLLED_BACK' }).eq('id', dep.release_id);
    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'DEPLOYMENT_ROLLED_BACK',
      resourceType: 'deployment',
      resourceId: id,
      payload: { rationale: body.rationale },
      ipAddress: req.ip,
    });
    return { deployment: dep };
  });

  // Incidents & Autonomous Investigation
  app.get('/incidents', { preHandler: [authenticateRequest, requirePermission('incidents:read')] }, async (req) => {
    const { data } = await supabase
      .from('incidents')
      .select('*, projects(name), releases(version, risk_score)')
      .eq('organization_id', req.auth!.organizationId)
      .order('detected_at', { ascending: false });
    return { incidents: data ?? [] };
  });

  app.post('/incidents', { preHandler: [authenticateRequest, requirePermission('incidents:write')] }, async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({
      projectId: z.string().uuid(),
      releaseId: z.string().uuid().optional(),
      deploymentId: z.string().uuid().optional(),
      title: z.string().min(3).max(200),
      severity: z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']),
      errorRateRatio: z.number().optional(),
      latencyDeltaPct: z.number().optional(),
    }).parse(req.body);

    let releaseInfo: { version?: string; risk_score?: number; changed_files?: Array<{ path: string }> } | null = null;
    let sqlRisk = 'NONE';
    if (body.releaseId) {
      const [{ data: rel }, { data: sqls }] = await Promise.all([
        supabase.from('releases').select('version, risk_score, changed_files').eq('id', body.releaseId).single(),
        supabase.from('sql_migration_analyses').select('lock_risk').eq('release_id', body.releaseId),
      ]);
      releaseInfo = rel;
      sqlRisk = sqls?.[0]?.lock_risk ?? 'NONE';
    }

    const inv = investigateIncident({
      title: body.title,
      severity: body.severity,
      releaseVersion: releaseInfo?.version,
      riskScore: releaseInfo?.risk_score ? Number(releaseInfo.risk_score) : undefined,
      sqlLockRisk: sqlRisk,
      changedFiles: releaseInfo?.changed_files?.map((f) => f.path),
      errorRateRatio: body.errorRateRatio,
      latencyDeltaPct: body.latencyDeltaPct,
    });

    const { data, error } = await supabase
      .from('incidents')
      .insert({
        organization_id: auth.organizationId,
        project_id: body.projectId,
        release_id: body.releaseId ?? null,
        deployment_id: body.deploymentId ?? null,
        title: body.title,
        severity: body.severity,
        status: 'INVESTIGATING',
        observed_evidence: inv.observedEvidence,
        causal_hypotheses: inv.causalHypotheses,
        timeline: [{ timestamp: new Date().toISOString(), event: 'Incident created & investigated' }],
        postmortem_md: inv.postmortemMd,
      })
      .select('*')
      .single();

    if (error) return reply.code(400).send({ error: error.message });

    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'INCIDENT_CREATED',
      resourceType: 'incident',
      resourceId: data.id,
      payload: { severity: body.severity },
      ipAddress: req.ip,
    });
    broadcastOrgEvent(auth.organizationId, 'incident.created', { incidentId: data.id, title: data.title, severity: data.severity });
    return reply.code(201).send({ incident: data });
  });

  app.post('/incidents/:id/resolve', { preHandler: [authenticateRequest, requirePermission('incidents:write')] }, async (req, reply) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const { data } = await supabase
      .from('incidents')
      .update({ status: 'RESOLVED', resolved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .select('*')
      .single();
    if (!data) return reply.code(404).send({ error: 'Incident not found' });
    return { incident: data };
  });

  // Controlled Remediation (L0-L4)
  app.get('/remediations', { preHandler: [authenticateRequest, requirePermission('incidents:read')] }, async (req) => {
    const { data } = await supabase
      .from('remediation_actions')
      .select('*, incidents(title, severity)')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false });
    return { remediations: data ?? [] };
  });

  app.post('/remediations', { preHandler: [authenticateRequest, requirePermission('remediation:propose')] }, async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({
      incidentId: z.string().uuid().optional(),
      releaseId: z.string().uuid().optional(),
      autonomyLevel: z.enum(['L0', 'L1', 'L2', 'L3', 'L4']),
      actionType: z.string().min(2),
      environmentTier: z.enum(['dev', 'staging', 'prod']).default('prod'),
    }).parse(req.body);

    const proposal = validateRemediationAction(body.autonomyLevel, body.actionType, body.environmentTier);

    const { data, error } = await supabase
      .from('remediation_actions')
      .insert({
        organization_id: auth.organizationId,
        incident_id: body.incidentId ?? null,
        release_id: body.releaseId ?? null,
        autonomy_level: proposal.autonomyLevel,
        action_type: proposal.actionType,
        title: proposal.title,
        plan: { steps: proposal.steps, rollbackPlan: proposal.rollbackPlan, requiresHumanApproval: proposal.requiresHumanApproval },
        reversibility: proposal.reversibility,
        status: 'PROPOSED',
      })
      .select('*')
      .single();

    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(201).send({ remediation: data });
  });

  app.post('/remediations/:id/approve', { preHandler: [authenticateRequest, requirePermission('remediation:approve')] }, async (req, reply) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const { data } = await supabase
      .from('remediation_actions')
      .update({ status: 'APPROVED', approved_by: auth.userId })
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .select('*')
      .single();
    if (!data) return reply.code(404).send({ error: 'Remediation action not found' });
    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'REMEDIATION_APPROVED',
      resourceType: 'remediation',
      resourceId: id,
      ipAddress: req.ip,
    });
    return { remediation: data };
  });

  app.post('/remediations/:id/execute', { preHandler: [authenticateRequest, requirePermission('remediation:execute')] }, async (req, reply) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    const { data: existing } = await supabase
      .from('remediation_actions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .single();
    if (!existing) return reply.code(404).send({ error: 'Remediation action not found' });
    if (existing.status !== 'APPROVED') {
      return reply.code(409).send({ error: 'Human approval is required before executing remediation action.' });
    }
    const { data } = await supabase
      .from('remediation_actions')
      .update({ status: 'EXECUTED', executed_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    return { remediation: data };
  });
}

function toSnakeMetrics(m: { errorRate: number; p95LatencyMs: number; rps: number; cpuPct: number; memPct: number; restartCount: number }) {
  return {
    error_rate: m.errorRate,
    p95_latency_ms: m.p95LatencyMs,
    rps: m.rps,
    cpu_pct: m.cpuPct,
    mem_pct: m.memPct,
    restart_count: m.restartCount,
  };
}
