'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plug, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [testMsg, setTestMsg] = useState('');
  const [provider, setProvider] = useState('slack');
  const [displayName, setDisplayName] = useState('SRE Release Alerts');

  const { data, isLoading, error } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiFetch<{ integrations: Array<{ id: string; provider: string; display_name: string; status: string; config_public: Record<string, unknown>; last_sync_at: string }> }>('/integrations'),
  });

  const addMut = useMutation({
    mutationFn: () => apiFetch('/integrations', { method: 'POST', body: JSON.stringify({ provider, displayName, configPublic: {} }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => apiFetch<{ result: { provider: string; mode: string; message: string } }>(`/integrations/${id}/test`, { method: 'POST' }),
    onSuccess: (res) => setTestMsg(`${res.result.provider} [${res.result.mode}]: ${res.result.message}`),
  });

  return (
    <AppShell title="Connectors & Integrations Hub" subtitle="Live Supabase, Linear, Notion adapters & documented CI/CD, Vercel, Slack simulators">
      <div className="space-y-6">
        <form onSubmit={(e) => { e.preventDefault(); addMut.mutate(); }} className="rg-card flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="rg-input">
              <option value="slack">Slack</option>
              <option value="vercel">Vercel</option>
              <option value="argocd">Argo CD</option>
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="prometheus">Prometheus / OTel</option>
            </select>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs text-slate-400">Display Name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="rg-input" />
          </div>
          <button type="submit" disabled={addMut.isPending} className="rg-btn-primary">Connect Integration</button>
        </form>

        {testMsg && <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">{testMsg}</div>}

        {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {(data?.integrations ?? []).map((i) => (
              <div key={i.id} className="rg-card flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Plug className="h-4 w-4 text-blue-400" />
                    <span>{i.display_name}</span>
                    <StatusBadge status={i.status} />
                  </div>
                  <div className="mt-1 text-xs text-slate-400">Provider: {i.provider}</div>
                </div>
                <button onClick={() => testMut.mutate(i.id)} className="rg-btn-secondary py-1 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> Test
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
