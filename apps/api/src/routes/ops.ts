import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PLAN_ENTITLEMENTS, SAAS_PLANS } from '@releaseguard/shared';
import {
  assessChaosReadiness,
  computePredictiveCalibration,
  computeTeamDoraMetrics,
  detectInfraDrift,
  estimateDeploymentFinOpsDelta,
} from '@releaseguard/engine';
import { authenticateRequest, encryptSecret, requirePermission } from '../auth/security.js';
import { recordAuditLog, supabase, verifyAuditChain } from '../db/supabase.js';
import { testConnectorIntegration } from '../services/connectors.js';
import { registerSseClient } from '../services/sse.js';

export async function opsRoutes(app: FastifyInstance) {
  // Infrastructure Drift Intelligence (never auto-applies)
  app.get('/drifts', { preHandler: [authenticateRequest, requirePermission('drift:read')] }, async (req) => {
    const { data } = await supabase
      .from('infra_drifts')
      .select('*, projects(name), environments(name, tier)')
      .eq('organization_id', req.auth!.organizationId)
      .order('detected_at', { ascending: false });
    return { drifts: data ?? [] };
  });

  app.post('/drifts/analyze', { preHandler: [authenticateRequest, requirePermission('drift:remediate_pr')] }, async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({
      projectId: z.string().uuid(),
      environmentId: z.string().uuid().optional(),
      provider: z.enum(['terraform', 'kubernetes']),
      resourceAddress: z.string().min(2),
      desiredState: z.record(z.unknown()),
      liveState: z.record(z.unknown()),
    }).parse(req.body);

    const drift = detectInfraDrift(body.provider, body.resourceAddress, body.desiredState, body.liveState);
    if (!drift) return { driftDetected: false };

    const { data, error } = await supabase
      .from('infra_drifts')
      .insert({
        organization_id: auth.organizationId,
        project_id: body.projectId,
        environment_id: body.environmentId ?? null,
        provider: drift.provider,
        resource_address: drift.resourceAddress,
        drift_type: drift.driftType,
        severity: drift.severity,
        public_exposure: drift.publicExposure,
        desired_state: body.desiredState,
        live_state: body.liveState,
        patch_pr_diff: drift.patchPrDiff,
        status: 'DETECTED',
      })
      .select('*')
      .single();

    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(201).send({ driftDetected: true, drift: data });
  });

  app.post('/drifts/:id/open-pr', { preHandler: [authenticateRequest, requirePermission('drift:remediate_pr')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data } = await supabase
      .from('infra_drifts')
      .update({ status: 'PR_OPENED' })
      .eq('id', id)
      .eq('organization_id', req.auth!.organizationId)
      .select('*')
      .single();
    if (!data) return reply.code(404).send({ error: 'Drift record not found' });
    return { drift: data, note: 'Remediation PR diff generated; never auto-applied to live infrastructure.' };
  });

  // Cloud FinOps Intelligence (transparent manifest cost deltas)
  app.get('/finops', { preHandler: [authenticateRequest, requirePermission('finops:read')] }, async (req) => {
    const { data } = await supabase
      .from('finops_estimates')
      .select('*, projects(name), releases(version)')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false });
    const rows = data ?? [];
    const netMonthlyDeltaUsd = Number(rows.reduce((s, r) => s + Number(r.monthly_delta_usd), 0).toFixed(2));
    return { estimates: rows, netMonthlyDeltaUsd };
  });

  app.post('/finops/estimate', { preHandler: [authenticateRequest, requirePermission('finops:read')] }, async (req) => {
    const auth = req.auth!;
    const body = z.object({
      projectId: z.string().uuid(),
      releaseId: z.string().uuid().optional(),
      replicasDelta: z.number(),
      vcpuPerReplica: z.number().positive(),
      memoryGbPerReplica: z.number().positive(),
      storageGbDelta: z.number().optional(),
    }).parse(req.body);

    const est = estimateDeploymentFinOpsDelta(body);
    const { data } = await supabase
      .from('finops_estimates')
      .insert({
        organization_id: auth.organizationId,
        project_id: body.projectId,
        release_id: body.releaseId ?? null,
        monthly_delta_usd: est.monthlyDeltaUsd,
        cost_breakdown: est.costBreakdown,
        confidence_note: est.confidenceNote,
        source_type: est.sourceType,
      })
      .select('*')
      .single();
    return { estimate: data };
  });

  // Ethical DORA & Developer Experience Intelligence (zero individual developer ranking)
  app.get('/dora', { preHandler: [authenticateRequest, requirePermission('dora:read')] }, async (req) => {
    const q = req.query as Record<string, string>;
    let query = supabase
      .from('dora_metrics_daily')
      .select('*, projects(name)')
      .eq('organization_id', req.auth!.organizationId)
      .order('metric_date', { ascending: true });
    if (q.projectId) query = query.eq('project_id', q.projectId);

    const { data } = await query;
    const rows = (data ?? []).map((r) => ({
      deployCount: r.deploy_count,
      leadTimeHours: Number(r.lead_time_hours),
      changeFailureRate: Number(r.change_failure_rate),
      mttrHours: Number(r.mttr_hours),
      bottleneckStage: r.bottleneck_stage,
    }));

    return {
      summary: computeTeamDoraMetrics(rows, q.projectId ? 'PROJECT' : 'ORGANIZATION'),
      series: data ?? [],
    };
  });

  // Compliance & Audit Center
  app.get('/compliance', { preHandler: [authenticateRequest, requirePermission('compliance:read')] }, async (req) => {
    const { data } = await supabase
      .from('compliance_controls')
      .select('*')
      .eq('organization_id', req.auth!.organizationId)
      .order('framework', { ascending: true });
    return { controls: data ?? [] };
  });

  app.get('/compliance/export', { preHandler: [authenticateRequest, requirePermission('compliance:export')] }, async (req) => {
    const orgId = req.auth!.organizationId;
    const [controls, auditCheck, policies] = await Promise.all([
      supabase.from('compliance_controls').select('*').eq('organization_id', orgId),
      verifyAuditChain(orgId),
      supabase.from('policies').select('id, name, category, mode, severity, enabled').eq('organization_id', orgId),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      organizationId: orgId,
      auditChainIntegrity: auditCheck,
      controls: controls.data ?? [],
      activePolicies: policies.data ?? [],
    };
  });

  // Reliability Learning & Predictive Calibration + Cross-Project + Chaos
  app.get('/learning/calibration', { preHandler: [authenticateRequest, requirePermission('releases:read')] }, async (req) => {
    const { data } = await supabase
      .from('reliability_outcomes')
      .select('*, releases(version, title, risk_score, risk_level)')
      .eq('organization_id', req.auth!.organizationId)
      .order('recorded_at', { ascending: false });
    const rows = data ?? [];
    const metrics = computePredictiveCalibration(
      rows.map((r) => ({
        predictedIncidentProb: Number(r.predicted_incident_prob),
        actualIncidentOccurred: r.actual_incident_occurred,
      }))
    );
    return { calibration: metrics, outcomes: rows };
  });

  app.get('/chaos', { preHandler: [authenticateRequest, requirePermission('projects:read')] }, async (req) => {
    const { data } = await supabase
      .from('chaos_readiness')
      .select('*, projects(name), environments(name, tier)')
      .eq('organization_id', req.auth!.organizationId)
      .order('assessed_at', { ascending: false });
    return { assessments: data ?? [] };
  });

  app.post('/chaos/assess', { preHandler: [authenticateRequest, requirePermission('projects:write')] }, async (req) => {
    const auth = req.auth!;
    const body = z.object({
      projectId: z.string().uuid(),
      environmentId: z.string().uuid().optional(),
      hasCanaryStrategy: z.boolean(),
      hasHealthTelemetry: z.boolean(),
      hasRollbackPlan: z.boolean(),
      hasSloDefined: z.boolean(),
      environmentTier: z.enum(['dev', 'staging', 'prod']).default('staging'),
    }).parse(req.body);

    const res = assessChaosReadiness(body);
    const { data } = await supabase
      .from('chaos_readiness')
      .insert({
        organization_id: auth.organizationId,
        project_id: body.projectId,
        environment_id: body.environmentId ?? null,
        readiness_score: res.readinessScore,
        gaps: res.gaps,
        recommended_experiments: res.recommendedExperiments,
        prod_blocked: res.prodBlocked,
      })
      .select('*')
      .single();
    return { assessment: data };
  });

  app.get('/cross-project', { preHandler: [authenticateRequest, requirePermission('projects:read')] }, async (req) => {
    const orgId = req.auth!.organizationId;
    const [{ data: projects }, { data: releases }, { data: sboms }] = await Promise.all([
      supabase.from('projects').select('*').eq('organization_id', orgId),
      supabase.from('releases').select('project_id, risk_score, risk_level, changed_files').eq('organization_id', orgId),
      supabase.from('sbom_artifacts').select('release_id, vulnerabilities').eq('organization_id', orgId),
    ]);

    const sharedHotspots = new Map<string, number>();
    for (const r of releases ?? []) {
      for (const f of (r.changed_files as Array<{ path: string }>) ?? []) {
        const segment = f.path.split('/').slice(0, 2).join('/');
        sharedHotspots.set(segment, (sharedHotspots.get(segment) ?? 0) + 1);
      }
    }

    return {
      projectCount: projects?.length ?? 0,
      projects: (projects ?? []).map((p) => {
        const pRels = (releases ?? []).filter((r) => r.project_id === p.id);
        const avgRisk = pRels.length ? Number((pRels.reduce((s, r) => s + Number(r.risk_score), 0) / pRels.length).toFixed(1)) : 0;
        return { id: p.id, name: p.name, serviceTier: p.service_tier, releaseCount: pRels.length, avgRiskScore: avgRisk };
      }),
      sharedDependencyHotspots: [...sharedHotspots.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([pathPrefix, touches]) => ({ pathPrefix, touches })),
      totalOrgVulnerabilities: (sboms ?? []).reduce((s, b) => s + ((b.vulnerabilities as unknown[])?.length ?? 0), 0),
    };
  });

  // Integrations
  app.get('/integrations', { preHandler: [authenticateRequest, requirePermission('projects:read')] }, async (req) => {
    const { data } = await supabase
      .from('integrations')
      .select('id, provider, display_name, status, config_public, last_sync_at, created_at')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false });
    return { integrations: data ?? [] };
  });

  app.post('/integrations', { preHandler: [authenticateRequest, requirePermission('integrations:manage')] }, async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({
      provider: z.enum(['github', 'gitlab', 'linear', 'notion', 'supabase', 'vercel', 'slack', 'argocd', 'prometheus']),
      displayName: z.string().min(2).max(80),
      configPublic: z.record(z.unknown()).default({}),
      secretToken: z.string().optional(),
    }).parse(req.body);

    const test = await testConnectorIntegration(body.provider, body.configPublic, body.secretToken);
    const { data, error } = await supabase
      .from('integrations')
      .upsert(
        {
          organization_id: auth.organizationId,
          provider: body.provider,
          display_name: body.displayName,
          status: test.mode === 'LIVE' && test.reachable ? 'CONNECTED' : 'SIMULATOR',
          config_public: body.configPublic,
          secret_enc: body.secretToken ? encryptSecret(body.secretToken) : null,
          last_sync_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,provider,display_name' }
      )
      .select('id, provider, display_name, status, config_public, last_sync_at')
      .single();
    if (error) return reply.code(400).send({ error: error.message });
    return reply.code(201).send({ integration: data, connectionTest: test });
  });

  app.post('/integrations/:id/test', { preHandler: [authenticateRequest, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data } = await supabase
      .from('integrations')
      .select('provider, config_public')
      .eq('id', id)
      .eq('organization_id', req.auth!.organizationId)
      .single();
    if (!data) return reply.code(404).send({ error: 'Integration not found' });
    const res = await testConnectorIntegration(data.provider, data.config_public);
    return { result: res };
  });

  // Billing & Usage Metering (explicit Sandbox Billing Adapter — never fake Stripe!)
  app.get('/billing', { preHandler: authenticateRequest }, async (req) => {
    const auth = req.auth!;
    const periodYm = new Date().toISOString().slice(0, 7);
    const [{ data: org }, { data: usage }] = await Promise.all([
      supabase.from('organizations').select('plan, billing_status, stripe_customer_id').eq('id', auth.organizationId).single(),
      supabase.from('usage_metering').select('*').eq('organization_id', auth.organizationId).eq('period_ym', periodYm).maybeSingle(),
    ]);
    return {
      billingAdapterMode: 'SANDBOX_METERING_ADAPTER',
      currentPlan: org?.plan ?? auth.organizationPlan,
      billingStatus: org?.billing_status ?? 'ACTIVE',
      entitlements: PLAN_ENTITLEMENTS[(org?.plan ?? auth.organizationPlan) as keyof typeof PLAN_ENTITLEMENTS],
      usage: usage ?? { period_ym: periodYm, releases_count: 0, deployments_count: 0, sbom_scans_count: 0, ai_tokens_used: 0 },
      allPlans: Object.values(PLAN_ENTITLEMENTS),
    };
  });

  app.post('/billing/upgrade', { preHandler: [authenticateRequest, requirePermission('billing:manage')] }, async (req) => {
    const auth = req.auth!;
    const body = z.object({ plan: z.enum(SAAS_PLANS) }).parse(req.body);
    const { data: org } = await supabase
      .from('organizations')
      .update({ plan: body.plan, updated_at: new Date().toISOString() })
      .eq('id', auth.organizationId)
      .select('id, name, plan, billing_status')
      .single();

    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'BILLING_PLAN_CHANGED_SANDBOX',
      resourceType: 'organization',
      resourceId: auth.organizationId,
      payload: { plan: body.plan },
      ipAddress: req.ip,
    });
    return {
      organization: org,
      billingAdapterMode: 'SANDBOX_METERING_ADAPTER',
      note: 'Plan entitlements updated in sandbox metering adapter; configure Stripe live secret for production invoicing.',
    };
  });

  // Audit Logs & Hash Chain Verification
  app.get('/audit-logs', { preHandler: [authenticateRequest, requirePermission('audit:read')] }, async (req) => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*, users:actor_id(email, full_name)')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false })
      .limit(200);
    return { logs: data ?? [] };
  });

  app.get('/audit-logs/verify', { preHandler: [authenticateRequest, requirePermission('audit:read')] }, async (req) => {
    return { verification: await verifyAuditChain(req.auth!.organizationId) };
  });

  // Real-time SSE Stream
  app.get('/stream', { preHandler: authenticateRequest }, async (req, reply) => {
    const auth = req.auth!;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ organizationId: auth.organizationId, role: auth.role })}\n\n`);
    const unregister = registerSseClient(auth.organizationId, reply);
    const keepalive = setInterval(() => {
      try {
        reply.raw.write(': keepalive\n\n');
      } catch {
        clearInterval(keepalive);
      }
    }, 20000);

    req.raw.on('close', () => {
      clearInterval(keepalive);
      unregister();
    });
  });
}
