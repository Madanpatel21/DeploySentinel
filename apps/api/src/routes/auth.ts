import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PLAN_ENTITLEMENTS, RBAC_ROLES, type RbacRole } from '@releaseguard/shared';
import {
  authenticateRequest,
  encryptSecret,
  decryptSecret,
  generateTotpSetup,
  hashPassword,
  requirePermission,
  signAccessToken,
  verifyPassword,
  verifyTotpToken,
} from '../auth/security.js';
import { recordAuditLog, supabase } from '../db/supabase.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      fullName: z.string().min(2).max(120),
      password: z.string().min(8).max(128),
      organizationName: z.string().min(2).max(120),
    }).parse(req.body);

    const slugBase = body.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org';
    const slug = `${slugBase}-${crypto.randomBytes(3).toString('hex')}`;
    const passwordHash = await hashPassword(body.password);

    const { data: existingUser } = await supabase.from('users').select('id').eq('email', body.email.toLowerCase()).maybeSingle();
    if (existingUser) {
      return reply.code(409).send({ error: 'Email is already registered' });
    }

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({ name: body.organizationName, slug, plan: 'STARTER', billing_status: 'ACTIVE' })
      .select('*')
      .single();
    if (orgErr) return reply.code(500).send({ error: orgErr.message });

    const { data: user, error: usrErr } = await supabase
      .from('users')
      .insert({ email: body.email.toLowerCase(), full_name: body.fullName, password_hash: passwordHash })
      .select('id, email, full_name, mfa_enabled, status, created_at')
      .single();
    if (usrErr) return reply.code(500).send({ error: usrErr.message });

    await supabase.from('memberships').insert({
      organization_id: org.id,
      user_id: user.id,
      role: 'ORG_OWNER',
    });

    const token = await signAccessToken({
      userId: user.id,
      email: user.email,
      organizationId: org.id,
      role: 'ORG_OWNER',
    });

    await recordAuditLog({
      organizationId: org.id,
      actorId: user.id,
      actorRole: 'ORG_OWNER',
      action: 'ORG_REGISTERED',
      resourceType: 'organization',
      resourceId: org.id,
      payload: { slug: org.slug },
      ipAddress: req.ip,
    });

    return reply.code(201).send({
      token,
      user: { ...user, role: 'ORG_OWNER', organizationId: org.id, organizationName: org.name, plan: org.plan },
    });
  });

  app.post('/auth/login', async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      organizationId: z.string().uuid().optional(),
      totpCode: z.string().optional(),
    }).parse(req.body);

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', body.email.toLowerCase())
      .maybeSingle();

    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }
    if (user.status !== 'ACTIVE') {
      return reply.code(403).send({ error: 'User account is suspended or inactive' });
    }

    if (user.mfa_enabled && user.mfa_secret_enc) {
      if (!body.totpCode) {
        return reply.code(401).send({ error: 'MFA code required', mfaRequired: true });
      }
      const secret = decryptSecret(user.mfa_secret_enc);
      if (!verifyTotpToken(secret, body.totpCode)) {
        return reply.code(401).send({ error: 'Invalid MFA verification code' });
      }
    }

    const { data: memberships } = await supabase
      .from('memberships')
      .select('role, organization_id, organizations(id, name, slug, plan)')
      .eq('user_id', user.id);

    if (!memberships || memberships.length === 0) {
      return reply.code(403).send({ error: 'No organization memberships found' });
    }

    const chosen = body.organizationId
      ? memberships.find((m) => m.organization_id === body.organizationId) ?? memberships[0]
      : memberships[0];

    const org = chosen.organizations as unknown as { id: string; name: string; slug: string; plan: string };
    const token = await signAccessToken({
      userId: user.id,
      email: user.email,
      organizationId: org.id,
      role: chosen.role as RbacRole,
    });

    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

    await recordAuditLog({
      organizationId: org.id,
      actorId: user.id,
      actorRole: chosen.role,
      action: 'USER_LOGIN',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: req.ip,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        mfa_enabled: user.mfa_enabled,
        role: chosen.role,
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        plan: org.plan,
      },
    };
  });

  app.get('/auth/me', { preHandler: authenticateRequest }, async (req) => {
    const auth = req.auth!;
    const { data: org } = await supabase.from('organizations').select('*').eq('id', auth.organizationId).single();
    return {
      user: auth,
      organization: org,
      entitlements: PLAN_ENTITLEMENTS[auth.organizationPlan],
    };
  });

  app.post('/auth/mfa/setup', { preHandler: authenticateRequest }, async (req) => {
    const auth = req.auth!;
    const setup = generateTotpSetup(auth.email);
    await supabase.from('users').update({ mfa_secret_enc: encryptSecret(setup.secretBase32) }).eq('id', auth.userId);
    return { otpauthUrl: setup.otpauthUrl, secretBase32: setup.secretBase32 };
  });

  app.post('/auth/mfa/enable', { preHandler: authenticateRequest }, async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({ code: z.string().length(6) }).parse(req.body);
    const { data: user } = await supabase.from('users').select('mfa_secret_enc').eq('id', auth.userId).single();
    if (!user?.mfa_secret_enc) return reply.code(400).send({ error: 'Run MFA setup first' });
    const ok = verifyTotpToken(decryptSecret(user.mfa_secret_enc), body.code);
    if (!ok) return reply.code(400).send({ error: 'Invalid TOTP verification code' });

    await supabase.from('users').update({ mfa_enabled: true }).eq('id', auth.userId);
    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'MFA_ENABLED',
      resourceType: 'user',
      resourceId: auth.userId,
      ipAddress: req.ip,
    });
    return { mfaEnabled: true };
  });

  app.get('/auth/api-keys', { preHandler: [authenticateRequest, requirePermission('api_keys:manage')] }, async (req) => {
    const { data } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, scopes, expires_at, revoked_at, last_used_at, created_at')
      .eq('organization_id', req.auth!.organizationId)
      .order('created_at', { ascending: false });
    return { apiKeys: data ?? [] };
  });

  app.post('/auth/api-keys', { preHandler: [authenticateRequest, requirePermission('api_keys:manage')] }, async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({ name: z.string().min(2).max(80) }).parse(req.body);
    const rawKey = `rg_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 16);

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        organization_id: auth.organizationId,
        user_id: auth.userId,
        name: body.name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
      })
      .select('id, name, key_prefix, scopes, created_at')
      .single();

    if (error) return reply.code(500).send({ error: error.message });

    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'API_KEY_CREATED',
      resourceType: 'api_key',
      resourceId: data.id,
      payload: { name: body.name, keyPrefix },
      ipAddress: req.ip,
    });

    return reply.code(201).send({ apiKey: data, plaintextKey: rawKey });
  });

  app.delete('/auth/api-keys/:id', { preHandler: [authenticateRequest, requirePermission('api_keys:manage')] }, async (req) => {
    const auth = req.auth!;
    const { id } = req.params as { id: string };
    await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', auth.organizationId);
    return { revoked: true };
  });

  app.get('/org/members', { preHandler: authenticateRequest }, async (req) => {
    const { data } = await supabase
      .from('memberships')
      .select('id, role, created_at, users(id, email, full_name, mfa_enabled, status, last_login_at)')
      .eq('organization_id', req.auth!.organizationId);
    return { members: data ?? [], availableRoles: RBAC_ROLES };
  });

  app.patch('/org/members/:membershipId', { preHandler: [authenticateRequest, requirePermission('users:manage')] }, async (req, reply) => {
    const auth = req.auth!;
    const { membershipId } = req.params as { membershipId: string };
    const body = z.object({ role: z.enum(RBAC_ROLES) }).parse(req.body);
    const { data, error } = await supabase
      .from('memberships')
      .update({ role: body.role })
      .eq('id', membershipId)
      .eq('organization_id', auth.organizationId)
      .select('*')
      .single();
    if (error || !data) return reply.code(404).send({ error: 'Membership not found' });

    await recordAuditLog({
      organizationId: auth.organizationId,
      actorId: auth.userId,
      actorRole: auth.role,
      action: 'MEMBER_ROLE_UPDATED',
      resourceType: 'membership',
      resourceId: membershipId,
      payload: { newRole: body.role },
      ipAddress: req.ip,
    });
    return { membership: data };
  });
}
