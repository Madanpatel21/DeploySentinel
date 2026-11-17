import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../server.js';
import { config } from '../config.js';
import type { FastifyInstance } from 'fastify';

describe('DeploySentinel API Integration & Security Suite', () => {
  let app: FastifyInstance;
  let acmeOwnerToken = '';
  let acmeRelMgrToken = '';
  let acmeDevToken = '';
  let betaOwnerToken = '';
  let acmeProjectId = '';
  let acmeProdEnvId = '';
  let createdReleaseId = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const login = async (email: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'DeploySentinel!2026' },
      });
      expect(res.statusCode).toBe(200);
      return res.json() as { token: string; user: { organizationId: string; role: string } };
    };

    const owner = await login('owner@acme.deploysentinel.io');
    const relMgr = await login('relmgr@acme.deploysentinel.io');
    const dev = await login('dev@acme.deploysentinel.io');
    const beta = await login('beta-owner@beta.deploysentinel.io');

    acmeOwnerToken = owner.token;
    acmeRelMgrToken = relMgr.token;
    acmeDevToken = dev.token;
    betaOwnerToken = beta.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves health, readiness, prometheus metrics, and OpenAPI JSON', async () => {
    const h = await app.inject({ method: 'GET', url: '/healthz' });
    expect(h.statusCode).toBe(200);

    const r = await app.inject({ method: 'GET', url: '/readyz' });
    expect(r.statusCode).toBe(200);
    expect(r.json().db).toBe('supabase-pg17-deploysentinel');

    const m = await app.inject({ method: 'GET', url: '/metrics' });
    expect(m.statusCode).toBe(200);
    expect(m.body).toContain('deploysentinel_releases_total');

    const o = await app.inject({ method: 'GET', url: '/api/v1/docs/json' });
    expect(o.statusCode).toBe(200);
    expect(o.json().openapi).toMatch(/^3\./);
  });

  it('rejects unauthenticated requests and invalid credentials', async () => {
    const noAuth = await app.inject({ method: 'GET', url: '/api/v1/releases' });
    expect(noAuth.statusCode).toBe(401);

    const badPass = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'owner@acme.deploysentinel.io', password: 'wrong-password' },
    });
    expect(badPass.statusCode).toBe(401);
  });

  it('enforces strict multi-tenant isolation between Acme and Beta', async () => {
    const acmeProjRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: { Authorization: `Bearer ${acmeOwnerToken}` },
    });
    const acmeProjects = acmeProjRes.json().projects as Array<{ id: string; slug: string; environments: Array<{ id: string; tier: string }> }>;
    expect(acmeProjects.length).toBeGreaterThanOrEqual(3);
    acmeProjectId = acmeProjects[0]!.id;
    acmeProdEnvId = acmeProjects[0]!.environments.find((e) => e.tier === 'prod')?.id ?? acmeProjects[0]!.environments[0]!.id;

    const betaProjRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: { Authorization: `Bearer ${betaOwnerToken}` },
    });
    const betaSlugs = (betaProjRes.json().projects as Array<{ slug: string }>).map((p) => p.slug);
    expect(betaSlugs).toContain('beta-payment-gateway');
    expect(betaSlugs).not.toContain('checkout-core-api');

    const acmeRelsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/releases',
      headers: { Authorization: `Bearer ${acmeOwnerToken}` },
    });
    const firstAcmeRelId = acmeRelsRes.json().releases[0].id as string;

    const crossTenantFetch = await app.inject({
      method: 'GET',
      url: `/api/v1/releases/${firstAcmeRelId}`,
      headers: { Authorization: `Bearer ${betaOwnerToken}` },
    });
    expect(crossTenantFetch.statusCode).toBe(404);
  });

  it('ingests a release deterministically, deduplicates via idempotency key, and enforces SoD & RBAC', async () => {
    const idem = `test-idem-${Date.now()}`;
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/api/v1/releases/ingest',
      headers: { Authorization: `Bearer ${acmeDevToken}` },
      payload: {
        projectId: acmeProjectId,
        environmentId: acmeProdEnvId,
        version: `v9.9.${Math.floor(Math.random() * 1000)}`,
        gitSha: '1234567abcdef',
        title: 'Update auth middleware & add concurrent index',
        description: 'Safe concurrent index creation',
        changedFiles: [{ path: 'src/auth/middleware.ts', additions: 40, deletions: 10 }],
        sqlMigrations: [{ filename: '099_idx.sql', sql: 'CREATE INDEX CONCURRENTLY idx_test ON users(email);' }],
        idempotencyKey: idem,
      },
    });
    expect(ingestRes.statusCode).toBe(201);
    createdReleaseId = ingestRes.json().release.id;
    expect(ingestRes.json().release.passport_signature).toMatch(/^rgp_v1\./);

    // Idempotent replay returns 200 deduplicated
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/releases/ingest',
      headers: { Authorization: `Bearer ${acmeDevToken}` },
      payload: {
        projectId: acmeProjectId,
        environmentId: acmeProdEnvId,
        version: 'v9.9.999',
        gitSha: '1234567abcdef',
        title: 'Duplicate',
        idempotencyKey: idem,
      },
    });
    expect(replayRes.statusCode).toBe(200);
    expect(replayRes.json().deduplicated).toBe(true);

    // Developer cannot approve prod release (RBAC)
    const devApprove = await app.inject({
      method: 'POST',
      url: `/api/v1/releases/${createdReleaseId}/approve`,
      headers: { Authorization: `Bearer ${acmeDevToken}` },
      payload: { decision: 'APPROVED', rationale: 'Trying to self-approve prod' },
    });
    expect(devApprove.statusCode).toBe(403);

    // Release Manager (non-author) can approve prod release
    const mgrApprove = await app.inject({
      method: 'POST',
      url: `/api/v1/releases/${createdReleaseId}/approve`,
      headers: { Authorization: `Bearer ${acmeRelMgrToken}` },
      payload: { decision: 'APPROVED', rationale: 'Verified risk factors & concurrent index.' },
    });
    expect(mgrApprove.statusCode).toBe(200);
    expect(mgrApprove.json().sod.valid).toBe(true);
    expect(mgrApprove.json().releaseStatus).toBe('APPROVED');
  }, 15000);

  it('verifies HMAC-SHA256 webhook signature, Policy Simulation Mode, Local Git Scanner, and Audit Chain', async () => {
    const badWebhook = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/github',
      headers: { 'x-hub-signature-256': 'sha256=invalid' },
      payload: {},
    });
    expect(badWebhook.statusCode).toBe(401);

    // Policy simulation
    const simRes = await app.inject({
      method: 'POST',
      url: '/api/v1/policies/simulate',
      headers: { Authorization: `Bearer ${acmeOwnerToken}` },
      payload: { name: 'Sim Risk Cap 25', ruleDsl: { maxRiskScore: 25 }, severity: 'BLOCK' },
    });
    expect(simRes.statusCode).toBe(200);
    expect(simRes.json().simulation.totalHistoricalReleases).toBeGreaterThanOrEqual(3);

    // Real local Git repository scan on /home/user/releaseguard
    const scanRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/scan-local-repo',
      headers: { Authorization: `Bearer ${acmeOwnerToken}` },
      payload: { projectId: acmeProjectId, repoPath: '/home/user/releaseguard' },
    });
    expect(scanRes.statusCode).toBe(201);
    expect(scanRes.json().inspection.changedFiles.length).toBeGreaterThan(0);

    // Cryptographic audit chain integrity
    const auditRes = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-logs/verify',
      headers: { Authorization: `Bearer ${acmeOwnerToken}` },
    });
    expect(auditRes.statusCode).toBe(200);
    expect(auditRes.json().verification.valid).toBe(true);
    expect(auditRes.json().verification.totalEntries).toBeGreaterThanOrEqual(3);

    // Ethical DORA check: no individual developer fields
    const doraRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dora',
      headers: { Authorization: `Bearer ${acmeOwnerToken}` },
    });
    expect(doraRes.statusCode).toBe(200);
    expect(doraRes.json().summary.ethicalGuarantee).toBe('NO_INDIVIDUAL_DEVELOPER_RANKING');
  }, 15000);

  it('verifies valid HMAC-SHA256 webhook signature succeeds', async () => {
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { Authorization: `Bearer ${acmeOwnerToken}` },
    });
    const orgId = me.json().user.organizationId as string;
    const payload = {
      organizationId: orgId,
      release: {
        projectId: acmeProjectId,
        version: `wh-${Date.now()}`,
        gitSha: 'deadbeef1234',
        title: 'Webhook verified release',
        changedFiles: [{ path: 'src/api/health.ts', additions: 5, deletions: 1 }],
      },
    };
    const sig = 'sha256=' + crypto.createHmac('sha256', config.WEBHOOK_SIGNING_SECRET).update(JSON.stringify(payload)).digest('hex');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/github',
      headers: { 'x-hub-signature-256': sig },
      payload,
    });
    expect(res.statusCode).toBe(202);
  });
});
