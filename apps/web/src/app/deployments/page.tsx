'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Layers, RotateCcw } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function DeploymentsPage() {
  const qc = useQueryClient();
  const [releaseId, setReleaseId] = useState('');
  const [adapter, setAdapter] = useState('argocd');
  const [strategy, setStrategy] = useState('canary');

  const deploymentsQ = useQuery({
    queryKey: ['deployments'],
    queryFn: () => apiFetch<{ deployments: Array<{ id: string; strategy: string; adapter: string; status: string; traffic_pct: number; health_verdict: string; rollback_recommended: boolean; auto_rollback_executed: boolean; releases?: { version: string }; projects?: { name: string }; environments?: { name: string } }> }>('/deployments'),
  });

  const releasesQ = useQuery({
    queryKey: ['releases'],
    queryFn: () => apiFetch<{ releases: Array<{ id: string; version: string; status: string }> }>('/releases'),
  });

  const deployMut = useMutation({
    mutationFn: () => apiFetch('/deployments', {
      method: 'POST',
      body: JSON.stringify({ releaseId: releaseId || releasesQ.data?.releases.find((r) => r.status === 'APPROVED')?.id, adapter, strategy }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }),
  });

  const promoteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/deployments/${id}/promote`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }),
  });

  const rollbackMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/deployments/${id}/rollback`, { method: 'POST', body: JSON.stringify({ rationale: 'Operator-initiated rollback from Deployment Control Center' }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }),
  });

  const approvedReleases = (releasesQ.data?.releases ?? []).filter((r) => r.status === 'APPROVED' || r.status === 'DEPLOYED');

  return (
    <AppShell title="Deployment Control Center" subtitle="Orchestrate progressive rollouts across Argo CD, GitHub, GitLab, K8s & Vercel adapters">
      <div className="space-y-6">
        <form onSubmit={(e) => { e.preventDefault(); deployMut.mutate(); }} className="rg-card space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Layers className="h-4 w-4 text-blue-400" /> Trigger Controlled Deployment</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <select value={releaseId || approvedReleases[0]?.id || ''} onChange={(e) => setReleaseId(e.target.value)} className="rg-input">
              {approvedReleases.map((r) => <option key={r.id} value={r.id}>{r.version} ({r.status})</option>)}
            </select>
            <select value={adapter} onChange={(e) => setAdapter(e.target.value)} className="rg-input">
              <option value="argocd">Argo CD</option>
              <option value="github">GitHub Actions</option>
              <option value="k8s">Kubernetes</option>
              <option value="vercel">Vercel</option>
              <option value="gitlab">GitLab CI</option>
            </select>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="rg-input">
              <option value="canary">Canary (10% Initial)</option>
              <option value="blue_green">Blue / Green</option>
              <option value="rolling">Rolling Update</option>
            </select>
          </div>
          {deployMut.error && <div className="text-xs text-rose-400">{(deployMut.error as Error).message}</div>}
          <button type="submit" disabled={deployMut.isPending || approvedReleases.length === 0} className="rg-btn-primary">
            Start Deployment
          </button>
        </form>

        {deploymentsQ.isLoading ? <LoadingState /> : deploymentsQ.error ? <ErrorState message={(deploymentsQ.error as Error).message} /> : (
          <div className="space-y-3">
            {(deploymentsQ.data?.deployments ?? []).map((d) => (
              <div key={d.id} className="rg-card flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <span>{d.projects?.name}</span>
                    <span className="font-mono text-blue-400">{d.releases?.version}</span>
                    <StatusBadge status={d.status} />
                    <StatusBadge status={d.health_verdict} />
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Env: {d.environments?.name} · Adapter: {d.adapter} · Strategy: {d.strategy} · Traffic: {d.traffic_pct}% · Auto-Rollback Executed: {String(d.auto_rollback_executed)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => promoteMut.mutate(d.id)} disabled={d.status === 'PROMOTED' || d.status === 'ROLLED_BACK'} className="rg-btn-primary py-1.5 text-xs">
                    <ArrowUpRight className="h-3.5 w-3.5" /> Promote 100%
                  </button>
                  <button onClick={() => rollbackMut.mutate(d.id)} disabled={d.status === 'ROLLED_BACK'} className="rg-btn-secondary py-1.5 text-xs text-rose-300">
                    <RotateCcw className="h-3.5 w-3.5" /> Operator Rollback
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
