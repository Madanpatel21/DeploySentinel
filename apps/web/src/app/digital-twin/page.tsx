'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cpu } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function DigitalTwinPage() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const { data, isLoading, error } = useQuery({
    queryKey: ['releases'],
    queryFn: () => apiFetch<{ releases: Array<{ id: string; version: string; digital_twin: { snapshotId: string; environmentTier: string; simulatedTrafficSplit: { baselinePct: number; canaryPct: number }; predictedLatencyDeltaMs: number; predictedLockContentionRisk: string; policyGateForecast: string; topologyNodes: Array<{ id: string; label: string; tier: string; impact: string }> } }> }>('/releases'),
  });

  const releases = data?.releases ?? [];
  const active = releases[selectedIdx];
  const twin = active?.digital_twin;

  return (
    <AppShell title="Deployment Digital Twin" subtitle="Pre-deployment behavioral snapshot modeling topology, traffic split & lock contention">
      {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : (
        <div className="space-y-6">
          <div className="rg-card flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-slate-300">Inspect Digital Twin for Release:</label>
            <select value={selectedIdx} onChange={(e) => setSelectedIdx(Number(e.target.value))} className="rg-input max-w-xs">
              {releases.map((r, i) => <option key={r.id} value={i}>{r.version}</option>)}
            </select>
          </div>

          {twin && (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rg-card">
                <div className="text-xs text-slate-400">Snapshot ID</div>
                <div className="mt-1 font-mono text-sm font-semibold text-white">{twin.snapshotId}</div>
              </div>
              <div className="rg-card">
                <div className="text-xs text-slate-400">Traffic Split Simulation</div>
                <div className="mt-1 text-lg font-bold text-blue-400">
                  {twin.simulatedTrafficSplit?.baselinePct ?? 90}% / {twin.simulatedTrafficSplit?.canaryPct ?? 10}%
                </div>
              </div>
              <div className="rg-card">
                <div className="text-xs text-slate-400">Predicted Latency Delta</div>
                <div className="mt-1 text-lg font-bold text-amber-300">+{twin.predictedLatencyDeltaMs ?? 0} ms</div>
              </div>
              <div className="rg-card">
                <div className="text-xs text-slate-400">Policy Gate Forecast</div>
                <div className="mt-1"><StatusBadge status={twin.policyGateForecast ?? 'PASS'} /></div>
              </div>
            </div>
          )}

          <div className="rg-card">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
              <Cpu className="h-4 w-4 text-blue-400" /> Twin Service Topology State
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(twin?.topologyNodes ?? []).map((n) => (
                <div key={n.id} className={`rounded-lg border p-3 text-xs ${n.impact === 'direct' ? 'border-rose-500/40 bg-rose-500/10' : n.impact === 'transitive' ? 'border-amber-500/40 bg-amber-500/10' : 'border-slate-800 bg-slate-950/70'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{n.label}</span>
                    <span className="rg-badge bg-slate-800 text-slate-300">{n.tier}</span>
                  </div>
                  <div className="mt-1 uppercase tracking-wider text-[10px] text-slate-400">Impact: {n.impact}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
