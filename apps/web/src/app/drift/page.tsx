'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, GitPullRequest } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, RiskBadge, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function DriftPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['drifts'],
    queryFn: () => apiFetch<{ drifts: Array<{ id: string; provider: string; resource_address: string; drift_type: string; severity: string; public_exposure: boolean; patch_pr_diff: string; status: string; projects?: { name: string } }> }>('/drifts'),
  });

  const openPrMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/drifts/${id}/open-pr`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drifts'] }),
  });

  return (
    <AppShell title="Infrastructure Drift Intelligence" subtitle="Terraform & Kubernetes live-vs-desired drift with PR patch synthesis (never auto-applied)">
      {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : (
        <div className="space-y-4">
          {(data?.drifts ?? []).map((d) => (
            <div key={d.id} className="rg-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-amber-400" />
                  <span className="font-mono text-sm font-semibold text-white">{d.resource_address}</span>
                  <span className="rg-badge bg-slate-800 text-slate-300">{d.provider}</span>
                  <RiskBadge level={d.severity} />
                  <StatusBadge status={d.status} />
                </div>
                {d.status === 'DETECTED' && (
                  <button onClick={() => openPrMut.mutate(d.id)} className="rg-btn-secondary py-1 text-xs">
                    <GitPullRequest className="h-3.5 w-3.5" /> Generate Reconciliation PR
                  </button>
                )}
              </div>
              {d.public_exposure && (
                <div className="rounded bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300">
                  Critical Alert: Live state introduced unintended 0.0.0.0/0 public network exposure!
                </div>
              )}
              <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-300">{d.patch_pr_diff}</pre>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
