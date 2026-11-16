'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function HealthPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => apiFetch<{ deployments: Array<{ id: string; health_verdict: string; started_at: string; baseline_metrics: { errorRate: number; p95LatencyMs: number; cpuPct: number }; canary_metrics: { errorRate: number; p95LatencyMs: number; cpuPct: number }; projects?: { name: string }; releases?: { version: string } }> }>('/deployments'),
  });

  return (
    <AppShell title="Post-Deployment Health Intelligence" subtitle="OTel latency, error-rate & resource saturation telemetry across production rollouts">
      {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data?.deployments ?? []).map((d) => (
            <div key={d.id} className="rg-card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <Activity className="h-4 w-4 text-blue-400" />
                  <span>{d.projects?.name} · {d.releases?.version}</span>
                </div>
                <StatusBadge status={d.health_verdict} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded bg-slate-950 p-2.5">
                  <div className="text-slate-400">Error Rate</div>
                  <div className="mt-1 font-bold text-white">{((d.canary_metrics?.errorRate ?? 0) * 100).toFixed(2)}%</div>
                </div>
                <div className="rounded bg-slate-950 p-2.5">
                  <div className="text-slate-400">p95 Latency</div>
                  <div className="mt-1 font-bold text-white">{d.canary_metrics?.p95LatencyMs ?? 0} ms</div>
                </div>
                <div className="rounded bg-slate-950 p-2.5">
                  <div className="text-slate-400">CPU Saturation</div>
                  <div className="mt-1 font-bold text-white">{d.canary_metrics?.cpuPct ?? 0}%</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
