'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Terminal } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function ChaosPage() {
  const qc = useQueryClient();
  const chaosQ = useQuery({
    queryKey: ['chaos'],
    queryFn: () => apiFetch<{ assessments: Array<{ id: string; readiness_score: number; gaps: string[]; recommended_experiments: Array<{ id: string; name: string; targetEnv: string }>; prod_blocked: boolean; projects?: { name: string } }> }>('/chaos'),
  });
  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<{ projects: Array<{ id: string }> }>('/projects'),
  });

  const assessMut = useMutation({
    mutationFn: () => apiFetch('/chaos/assess', {
      method: 'POST',
      body: JSON.stringify({
        projectId: projectsQ.data?.projects[0]?.id,
        hasCanaryStrategy: true,
        hasHealthTelemetry: true,
        hasRollbackPlan: true,
        hasSloDefined: true,
        environmentTier: 'staging',
      }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chaos'] }),
  });

  return (
    <AppShell title="Chaos Engineering Readiness" subtitle="Resilience gap scoring & safe non-production experiment templates">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-amber-400" /> Production Chaos Injection Blocked by Default (`prod_blocked = true`). Experiments target staging/dev only.</span>
          <button onClick={() => assessMut.mutate()} disabled={assessMut.isPending} className="rg-btn-secondary py-1 text-xs">Run Readiness Check</button>
        </div>

        {chaosQ.isLoading ? <LoadingState /> : chaosQ.error ? <ErrorState message={(chaosQ.error as Error).message} /> : (
          <div className="space-y-4">
            {(chaosQ.data?.assessments ?? []).map((a) => (
              <div key={a.id} className="rg-card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Terminal className="h-4 w-4 text-blue-400" /> {a.projects?.name ?? 'Project'}
                  </div>
                  <span className="text-lg font-bold text-emerald-400">{a.readiness_score} / 100</span>
                </div>
                {a.gaps?.length > 0 && (
                  <div className="text-xs text-amber-300">Gaps: {a.gaps.join('; ')}</div>
                )}
                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  {a.recommended_experiments?.map((e) => (
                    <div key={e.id} className="rounded bg-slate-950 p-2.5 text-slate-300">
                      <div className="font-medium text-white">{e.name}</div>
                      <div className="text-[11px] text-slate-400">Target: {e.targetEnv} (non-prod only)</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
