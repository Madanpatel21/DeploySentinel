import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import * as OTPAuth from 'otpauth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasPermission, type Permission, type RbacRole } from '@deploysentinel/shared';
import { config } from '../config.js';
import { supabase } from '../db/supabase.js';

export interface AuthContext {
  userId: string;
  email: string;
  fullName: string;
  organizationId: string;
  organizationSlug: string;
  organizationPlan: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  role: RbacRole;
  authMethod: 'jwt' | 'api_key';
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

const jwtSecretKey = new TextEncoder().encode(config.JWT_SECRET);
const encKey = crypto.createHash('sha256').update(config.ENCRYPTION_KEY).digest();

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signAccessToken(payload: {
  userId: string;
  email: string;
  organizationId: string;
  role: RbacRole;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(jwtSecretKey);
}

export async function verifyAccessToken(token: string): Promise<{
  userId: string;
  email: string;
  organizationId: string;
  role: RbacRole;
}> {
  const { payload } = await jwtVerify(token, jwtSecretKey);
  return payload as unknown as {
    userId: string;
    email: string;
    organizationId: string;
    role: RbacRole;
  };
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

export function decryptSecret(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split('.');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid encrypted secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

export function generateTotpSetup(email: string) {
  const totp = new OTPAuth.TOTP({
    issuer: 'DeploySentinel',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return { secretBase32: totp.secret.base32, otpauthUrl: totp.toString() };
}

export function verifyTotpToken(secretBase32: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: 'DeploySentinel',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

export function verifyWebhookHmac(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  const cleanSig = signatureHeader.replace(/^sha256=/, '');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (cleanSig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cleanSig), Buffer.from(expected));
}

export async function authenticateRequest(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  if (apiKeyHeader && apiKeyHeader.startsWith('rg_live_')) {
    const keyHash = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');
    const { data: keyRow } = await supabase
      .from('api_keys')
      .select('id, organization_id, user_id, revoked_at, expires_at')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (!keyRow || keyRow.revoked_at || (keyRow.expires_at && new Date(keyRow.expires_at) < new Date())) {
      reply.code(401).send({ error: 'Invalid or revoked API key' });
      return;
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role, organizations(slug, plan), users(email, full_name)')
      .eq('organization_id', keyRow.organization_id)
      .eq('user_id', keyRow.user_id)
      .single();

    if (!membership) {
      reply.code(403).send({ error: 'API key owner has no active organization membership' });
      return;
    }

    await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id);

    const org = membership.organizations as unknown as { slug: string; plan: AuthContext['organizationPlan'] };
    const usr = membership.users as unknown as { email: string; full_name: string };

    req.auth = {
      userId: keyRow.user_id,
      email: usr.email,
      fullName: usr.full_name,
      organizationId: keyRow.organization_id,
      organizationSlug: org.slug,
      organizationPlan: org.plan,
      role: membership.role as RbacRole,
      authMethod: 'api_key',
    };
    return;
  }

  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.query as Record<string, string>)?.token;
  if (!token) {
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }

  try {
    const claims = await verifyAccessToken(token);
    const { data: membership } = await supabase
      .from('memberships')
      .select('role, organizations(slug, plan), users(email, full_name, status)')
      .eq('organization_id', claims.organizationId)
      .eq('user_id', claims.userId)
      .single();

    if (!membership) {
      reply.code(403).send({ error: 'Organization membership not found' });
      return;
    }

    const org = membership.organizations as unknown as { slug: string; plan: AuthContext['organizationPlan'] };
    const usr = membership.users as unknown as { email: string; full_name: string; status: string };
    if (usr.status !== 'ACTIVE') {
      reply.code(403).send({ error: 'User account is not active' });
      return;
    }

    req.auth = {
      userId: claims.userId,
      email: usr.email,
      fullName: usr.full_name,
      organizationId: claims.organizationId,
      organizationSlug: org.slug,
      organizationPlan: org.plan,
      role: membership.role as RbacRole,
      authMethod: 'jwt',
    };
  } catch {
    reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

export function requirePermission(permission: Permission) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      reply.code(401).send({ error: 'Unauthenticated' });
      return;
    }
    if (!hasPermission(req.auth.role, permission)) {
      reply.code(403).send({
        error: `Forbidden: role ${req.auth.role} lacks permission '${permission}'`,
      });
      return;
    }
  };
}
