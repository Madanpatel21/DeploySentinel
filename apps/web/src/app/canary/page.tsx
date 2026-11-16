'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Zap } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function CanaryPage() {
  const qc = useQueryClient();
  const [canaryErr, setCanaryErr] = useState(0.042);
  const [canaryLat, setCanaryLat] = useState(290);

  const { data, isLoading, error } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => apiFetch<{ deployments: Array<{ id: string; health_verdict: string; rollback_recommended: boolean; auto_rollback_executed: boolean; baseline_metrics: { errorRate: number; p95LatencyMs: number }; canary_metrics: { errorRate: number; p95LatencyMs: number }; releases?: { version: string } }> }>('/deployments'),
  });

  const activeDep = data?.deployments[0];

  const simTelemetryMut = useMutation({
    mutationFn: () =>
      apiFetch<{ verdict: { healthVerdict: string; anomalyScore: number; rollbackRecommended: boolean; autoRollbackExecuted: boolean; reasons: string[] } }>(
        `/deployments/${activeDep!.id}/telemetry`,
        {
          method: 'POST',
          body: JSON.stringify({
            baseline: { errorRate: 0.002, p95LatencyMs: 112, rps: 240, cpuPct: 41, memPct: 52, restartCount: 0 },
            canary: { errorRate: Number(canaryErr), p95LatencyMs: Number(canaryLat), rps: 28, cpuPct: 76, memPct: 68, restartCount: 3 },
          }),
        }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }),
  });

  const chartData = activeDep
    ? [
        { metric: 'Error Rate (%)', baseline: Number(((activeDep.baseline_metrics?.errorRate ?? 0) * 100).toFixed(2)), canary: Number(((activeDep.canary_metrics?.errorRate ?? 0) * 100).toFixed(2)) },
        { metric: 'p95 Latency (ms/10)', baseline: Number(((activeDep.baseline_metrics?.p95LatencyMs ?? 0) / 10).toFixed(1)), canary: Number(((activeDep.canary_metrics?.p95LatencyMs ?? 0) / 10).toFixed(1)) },
      ]
    : [];

  return (
    <AppShell title="Canary & Progressive Delivery Intelligence" subtitle="Statistical baseline vs canary anomaly verification (auto_rollback_enabled = false by default)">
      {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : !activeDep ? (
        <div className="rg-card text-xs text-slate-400">No active deployments found.</div>
      ) : (
        <div className="space-y-6">
          <div className="rg-card flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Zap className="h-4 w-4 text-amber-400" /> Canary Target: {activeDep.releases?.version}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Rollback Recommended: <strong className="text-amber-300">{String(activeDep.rollback_recommended)}</strong> · Auto-Rollback Executed: <strong className="text-emerald-400">{String(activeDep.auto_rollback_executed)}</strong>
              </div>
            </div>
            <StatusBadge status={activeDep.health_verdict} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rg-card">
              <h3 className="mb-3 text-sm font-semibold text-white">Baseline vs Canary Telemetry</h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="metric" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} />
                    <Bar dataKey="baseline" fill="#10b981" name="Baseline" />
                    <Bar dataKey="canary" fill="#f59e0b" name="Canary" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rg-card space-y-3">
              <h3 className="text-sm font-semibold text-white">Run Statistical Canary Check</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Canary Error Rate (0..1)</label>
                  <input type="number" step="0.001" value={canaryErr} onChange={(e) => setCanaryErr(Number(e.target.value))} className="rg-input" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Canary p95 Latency (ms)</label>
                  <input type="number" value={canaryLat} onChange={(e) => setCanaryLat(Number(e.target.value))} className="rg-input" />
                </div>
              </div>
              <button onClick={() => simTelemetryMut.mutate()} disabled={simTelemetryMut.isPending} className="rg-btn-primary">
                Evaluate Statistical Gate
              </button>
              {simTelemetryMut.data && (
                <div className="rounded bg-slate-950 p-3 text-xs">
                  <div className="font-semibold text-white">Verdict: {simTelemetryMut.data.verdict.healthVerdict} (z-score {simTelemetryMut.data.verdict.anomalyScore})</div>
                  <ul className="mt-1 list-disc pl-4 text-slate-300">
                    {simTelemetryMut.data.verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
