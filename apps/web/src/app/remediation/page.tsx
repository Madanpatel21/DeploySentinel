'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, CheckCircle2, Play } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function RemediationPage() {
  const qc = useQueryClient();
  const [autonomyLevel, setAutonomyLevel] = useState('L2');
  const [actionType, setActionType] = useState('scale_replicas_plus_2');

  const { data, isLoading, error } = useQuery({
    queryKey: ['remediations'],
    queryFn: () => apiFetch<{ remediations: Array<{ id: string; autonomy_level: string; action_type: string; title: string; reversibility: string; status: string; plan: { steps?: string[]; rollbackPlan?: string } }> }>('/remediations'),
  });

  const proposeMut = useMutation({
    mutationFn: () => apiFetch('/remediations', { method: 'POST', body: JSON.stringify({ autonomyLevel, actionType, environmentTier: 'prod' }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['remediations'] }),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/remediations/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['remediations'] }),
  });

  const executeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/remediations/${id}/execute`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['remediations'] }),
  });

  return (
    <AppShell title="Autonomous Remediation Engine (L0–L4)" subtitle="Explicit autonomy tiers, reversibility tagging & mandatory human approval gates">
      <div className="space-y-6">
        <form onSubmit={(e) => { e.preventDefault(); proposeMut.mutate(); }} className="rg-card flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Autonomy Level</label>
            <select value={autonomyLevel} onChange={(e) => setAutonomyLevel(e.target.value)} className="rg-input">
              <option value="L0">L0 (Observe Only)</option>
              <option value="L1">L1 (Recommend)</option>
              <option value="L2">L2 (Propose + Human Approve)</option>
              <option value="L3">L3 (Guarded Execute)</option>
              <option value="L4">L4 (Authorized Policy Auto)</option>
            </select>
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs text-slate-400">Remediation Action</label>
            <input value={actionType} onChange={(e) => setActionType(e.target.value)} className="rg-input" />
          </div>
          <button type="submit" disabled={proposeMut.isPending} className="rg-btn-primary">Propose Action</button>
        </form>

        {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : (
          <div className="space-y-3">
            {(data?.remediations ?? []).map((r) => (
              <div key={r.id} className="rg-card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Bot className="h-4 w-4 text-blue-400" />
                    <span>{r.title}</span>
                    <span className="rg-badge bg-indigo-500/20 text-indigo-300">{r.autonomy_level}</span>
                    <span className="rg-badge bg-slate-800 text-slate-300">{r.reversibility}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex gap-2">
                    {r.status === 'PROPOSED' && (
                      <button onClick={() => approveMut.mutate(r.id)} className="rg-btn-secondary py-1 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Approve
                      </button>
                    )}
                    {r.status === 'APPROVED' && (
                      <button onClick={() => executeMut.mutate(r.id)} className="rg-btn-primary py-1 text-xs">
                        <Play className="h-3.5 w-3.5" /> Execute Guarded Action
                      </button>
                    )}
                  </div>
                </div>
                <ul className="list-disc pl-5 text-xs text-slate-400">
                  {r.plan?.steps?.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
