'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function FinOpsPage() {
  const qc = useQueryClient();
  const [replicasDelta, setReplicasDelta] = useState(2);
  const [vcpuPerReplica, setVcpuPerReplica] = useState(2);
  const [memoryGbPerReplica, setMemoryGbPerReplica] = useState(4);

  const finopsQ = useQuery({
    queryKey: ['finops'],
    queryFn: () => apiFetch<{ netMonthlyDeltaUsd: number; estimates: Array<{ id: string; monthly_delta_usd: number; cost_breakdown: Record<string, number>; confidence_note: string; source_type: string; projects?: { name: string }; releases?: { version: string } }> }>('/finops'),
  });
  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<{ projects: Array<{ id: string; name: string }> }>('/projects'),
  });

  const estMut = useMutation({
    mutationFn: () => apiFetch('/finops/estimate', {
      method: 'POST',
      body: JSON.stringify({
        projectId: projectsQ.data?.projects[0]?.id,
        replicasDelta: Number(replicasDelta),
        vcpuPerReplica: Number(vcpuPerReplica),
        memoryGbPerReplica: Number(memoryGbPerReplica),
      }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finops'] }),
  });

  return (
    <AppShell title="Cloud FinOps Intelligence" subtitle="Manifest-based infrastructure cost delta estimation (transparent unit-rate math, never fabricated billing)">
      <div className="space-y-6">
        <div className="rg-card flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400">Net Estimated Monthly Cost Delta</div>
            <div className="mt-1 flex items-center gap-1 text-2xl font-bold text-emerald-400">
              <DollarSign className="h-5 w-5" /> {finopsQ.data?.netMonthlyDeltaUsd ?? 0} / mo
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <div>
              <label className="mb-1 block text-slate-400">Replicas Δ</label>
              <input type="number" value={replicasDelta} onChange={(e) => setReplicasDelta(Number(e.target.value))} className="rg-input w-24" />
            </div>
            <div>
              <label className="mb-1 block text-slate-400">vCPU</label>
              <input type="number" value={vcpuPerReplica} onChange={(e) => setVcpuPerReplica(Number(e.target.value))} className="rg-input w-24" />
            </div>
            <div>
              <label className="mb-1 block text-slate-400">RAM (GB)</label>
              <input type="number" value={memoryGbPerReplica} onChange={(e) => setMemoryGbPerReplica(Number(e.target.value))} className="rg-input w-24" />
            </div>
            <button onClick={() => estMut.mutate()} disabled={estMut.isPending} className="rg-btn-primary">Estimate Delta</button>
          </div>
        </div>

        {finopsQ.isLoading ? <LoadingState /> : finopsQ.error ? <ErrorState message={(finopsQ.error as Error).message} /> : (
          <div className="space-y-3">
            {(finopsQ.data?.estimates ?? []).map((e) => (
              <div key={e.id} className="rg-card space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{e.projects?.name} · {e.releases?.version ?? 'Manifest Estimate'}</span>
                  <span className="font-mono text-sm font-bold text-amber-300">+${e.monthly_delta_usd}/mo</span>
                </div>
                <div className="text-slate-400">{e.confidence_note}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
