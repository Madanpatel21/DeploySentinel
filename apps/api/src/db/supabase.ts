import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { config } from '../config.js';

export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'releaseguard' },
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws as never },
});

export async function recordAuditLog(params: {
  organizationId: string;
  actorId: string | null;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<{ id: string; entry_hash: string }> {
  const { data: latest } = await supabase
    .from('audit_logs')
    .select('entry_hash')
    .eq('organization_id', params.organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevHash = latest?.entry_hash ?? 'GENESIS_00000000000000000000000000000000';
  const createdAt = new Date().toISOString();
  const payloadObj = params.payload ?? {};

  const canonical = JSON.stringify({
    prevHash,
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    payload: payloadObj,
    createdAt,
  });

  const entryHash = crypto.createHash('sha256').update(canonical).digest('hex');

  const { data, error } = await supabase
    .from('audit_logs')
    .insert({
      organization_id: params.organizationId,
      actor_id: params.actorId,
      actor_role: params.actorRole,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      payload: payloadObj,
      prev_hash: prevHash,
      entry_hash: entryHash,
      ip_address: params.ipAddress ?? null,
      created_at: createdAt,
    })
    .select('id, entry_hash')
    .single();

  if (error) {
    throw new Error(`Audit log insert failed: ${error.message}`);
  }
  return data;
}

export async function verifyAuditChain(organizationId: string): Promise<{
  totalEntries: number;
  valid: boolean;
  brokenAtId?: string;
}> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  let expectedPrev = 'GENESIS_00000000000000000000000000000000';

  for (const row of rows) {
    if (row.prev_hash !== expectedPrev) {
      return { totalEntries: rows.length, valid: false, brokenAtId: row.id };
    }
    expectedPrev = row.entry_hash;
  }

  return { totalEntries: rows.length, valid: true };
}
