'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, KeyRound, Shield, Users } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function SettingsPage() {
  const qc = useQueryClient();
  const [keyName, setKeyName] = useState('CI Pipeline Key');
  const [newPlainKey, setNewPlainKey] = useState('');
  const [mfaSetupData, setMfaSetupData] = useState<{ otpauthUrl: string; secretBase32: string } | null>(null);

  const membersQ = useQuery({
    queryKey: ['members'],
    queryFn: () => apiFetch<{ members: Array<{ id: string; role: string; users: { email: string; full_name: string; mfa_enabled: boolean } }>; availableRoles: string[] }>('/org/members'),
  });
  const keysQ = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiFetch<{ apiKeys: Array<{ id: string; name: string; key_prefix: string; revoked_at: string | null }> }>('/auth/api-keys'),
  });
  const billingQ = useQuery({
    queryKey: ['billing'],
    queryFn: () => apiFetch<{ billingAdapterMode: string; currentPlan: string; usage: { releases_count: number; sbom_scans_count: number }; allPlans: Array<{ plan: string; monthlyPriceUsd: number }> }>('/billing'),
  });

  const createKeyMut = useMutation({
    mutationFn: () => apiFetch<{ plaintextKey: string }>('/auth/api-keys', { method: 'POST', body: JSON.stringify({ name: keyName }) }),
    onSuccess: (res) => {
      setNewPlainKey(res.plaintextKey);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const upgradeMut = useMutation({
    mutationFn: (plan: string) => apiFetch('/billing/upgrade', { method: 'POST', body: JSON.stringify({ plan }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  });

  const mfaSetupMut = useMutation({
    mutationFn: () => apiFetch<{ otpauthUrl: string; secretBase32: string }>('/auth/mfa/setup', { method: 'POST' }),
    onSuccess: (res) => setMfaSetupData(res),
  });

  return (
    <AppShell title="Organization, RBAC, Billing, MFA & API Keys" subtitle="Manage 9-role RBAC memberships, TOTP MFA, API credentials & commercial entitlements">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rg-card space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><CreditCard className="h-4 w-4 text-blue-400" /> Commercial SaaS Plan &amp; Metering</h2>
            {billingQ.data && (
              <>
                <div className="text-xs text-slate-300">
                  Active Plan: <strong className="text-blue-400">{billingQ.data.currentPlan}</strong> · Adapter: <code className="text-amber-300">{billingQ.data.billingAdapterMode}</code>
                </div>
                <div className="text-xs text-slate-400">
                  This Month: {billingQ.data.usage.releases_count} releases ingested · {billingQ.data.usage.sbom_scans_count} SBOM scans
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {billingQ.data.allPlans.map((p) => (
                    <button key={p.plan} onClick={() => upgradeMut.mutate(p.plan)} className="rg-btn-secondary py-1 text-xs">
                      Switch to {p.plan} (${p.monthlyPriceUsd})
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rg-card space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Shield className="h-4 w-4 text-emerald-400" /> TOTP Multi-Factor Authentication</h2>
            <p className="text-xs text-slate-400">Enroll RFC 6238 TOTP authenticator for elevated release approvals.</p>
            <button onClick={() => mfaSetupMut.mutate()} className="rg-btn-secondary text-xs">Generate MFA Secret</button>
            {mfaSetupData && (
              <div className="rounded bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-300 break-all">
                Secret: {mfaSetupData.secretBase32}
              </div>
            )}
          </div>
        </div>

        <div className="rg-card space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><KeyRound className="h-4 w-4 text-amber-400" /> API Keys (`rg_live_...`)</h2>
          <div className="flex gap-2">
            <input value={keyName} onChange={(e) => setKeyName(e.target.value)} className="rg-input max-w-xs" />
            <button onClick={() => createKeyMut.mutate()} className="rg-btn-primary text-xs">Issue Key</button>
          </div>
          {newPlainKey && (
            <div className="rounded bg-emerald-500/15 p-2.5 font-mono text-xs text-emerald-200">
              Copy once (never stored in plaintext): {newPlainKey}
            </div>
          )}
          <div className="space-y-1.5 text-xs">
            {(keysQ.data?.apiKeys ?? []).map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded bg-slate-950 px-3 py-2">
                <span>{k.name} · <code className="text-blue-300">{k.key_prefix}...</code></span>
                <span className={k.revoked_at ? 'text-rose-400' : 'text-emerald-400'}>{k.revoked_at ? 'Revoked' : 'Active'}</span>
              </div>
            ))}
          </div>
        </div>

        {membersQ.isLoading ? <LoadingState /> : membersQ.error ? <ErrorState message={(membersQ.error as Error).message} /> : (
          <div className="rg-card space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Users className="h-4 w-4 text-blue-400" /> Organization RBAC Directory (9 Roles)</h2>
            <div className="space-y-1.5 text-xs">
              {(membersQ.data?.members ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded bg-slate-950 px-3 py-2">
                  <span><strong className="text-white">{m.users.full_name}</strong> ({m.users.email})</span>
                  <span className="rg-badge bg-blue-500/20 text-blue-300">{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
