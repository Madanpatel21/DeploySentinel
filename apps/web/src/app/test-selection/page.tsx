'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function TestSelectionPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['test-selections'],
    queryFn: () => apiFetch<{ testSelections: Array<{ id: string; strategy_version: string; total_tests: number; estimated_savings_pct: number; predicted_catch_prob: number; selected_tests: Array<{ id: string; name: string; category: string; reason: string }>; skipped_tests: Array<{ id: string; name: string; reason: string }>; releases?: { version: string } }> }>('/test-selections'),
  });

  return (
    <AppShell title="Intelligent Test Selection (ITS)" subtitle="Risk-weighted suite reduction with mandatory security & migration test retention">
      {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : (
        <div className="space-y-4">
          {(data?.testSelections ?? []).map((t) => (
            <div key={t.id} className="rg-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Release {t.releases?.version}</span>
                  <span className="text-xs font-normal text-slate-400">({t.strategy_version})</span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-400 font-semibold">Time Saved: {t.estimated_savings_pct}%</span>
                  <span className="text-blue-300 font-semibold">Catch Prob: {(Number(t.predicted_catch_prob) * 100).toFixed(1)}%</span>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 text-xs">
                <div>
                  <div className="mb-2 font-semibold text-emerald-300">Selected Suites ({t.selected_tests?.length ?? 0})</div>
                  <div className="space-y-1.5">
                    {t.selected_tests?.map((st) => (
                      <div key={st.id} className="rounded bg-slate-950 p-2">
                        <div className="font-medium text-slate-200">{st.name} <span className="text-blue-400">[{st.category}]</span></div>
                        <div className="text-[11px] text-slate-400">{st.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 font-semibold text-slate-400">Safely Skipped ({t.skipped_tests?.length ?? 0})</div>
                  <div className="space-y-1.5">
                    {t.skipped_tests?.map((sk) => (
                      <div key={sk.id} className="rounded bg-slate-950/60 p-2 text-slate-400">
                        <div className="font-medium">{sk.name}</div>
                        <div className="text-[11px]">{sk.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
