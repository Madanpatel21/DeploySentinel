'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Play } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/api';

export default function PolicySimulationPage() {
  const [maxRiskScore, setMaxRiskScore] = useState(40);
  const [blockDestructiveSql, setBlockDestructiveSql] = useState(true);
  const [maxCriticalCves, setMaxCriticalCves] = useState(0);

  const simMut = useMutation({
    mutationFn: () =>
      apiFetch<{ simulation: { totalHistoricalReleases: number; currentlyBlocked: number; simulatedBlocked: number; deltaBlocked: number; newlyBlockedReleaseIds: string[] } }>(
        '/policies/simulate',
        {
          method: 'POST',
          body: JSON.stringify({
            name: `Simulated Threshold (${maxRiskScore})`,
            ruleDsl: { maxRiskScore: Number(maxRiskScore), blockDestructiveSql, maxCriticalCves: Number(maxCriticalCves) },
            severity: 'BLOCK',
          }),
        }
      ),
  });

  return (
    <AppShell title="Policy Simulation Mode" subtitle="Dry-run candidate governance rules against historical releases before enforcing">
      <div className="space-y-6">
        <div className="rg-card space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles className="h-4 w-4 text-indigo-400" /> Configure Candidate Rule Parameters
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Max Risk Score Ceiling</label>
              <input type="number" min={10} max={100} value={maxRiskScore} onChange={(e) => setMaxRiskScore(Number(e.target.value))} className="rg-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Max Critical CVEs Allowed</label>
              <input type="number" min={0} max={10} value={maxCriticalCves} onChange={(e) => setMaxCriticalCves(Number(e.target.value))} className="rg-input" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input type="checkbox" checked={blockDestructiveSql} onChange={(e) => setBlockDestructiveSql(e.target.checked)} />
                Block Destructive SQL (DROP/TRUNCATE)
              </label>
            </div>
          </div>
          <button onClick={() => simMut.mutate()} disabled={simMut.isPending} className="rg-btn-primary">
            <Play className="h-4 w-4" /> {simMut.isPending ? 'Simulating...' : 'Run Historical Dry-Run'}
          </button>
        </div>

        {simMut.data && (
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rg-card">
              <div className="text-xs text-slate-400">Historical Releases Evaluated</div>
              <div className="mt-1 text-2xl font-bold text-white">{simMut.data.simulation.totalHistoricalReleases}</div>
            </div>
            <div className="rg-card">
              <div className="text-xs text-slate-400">Currently Blocked</div>
              <div className="mt-1 text-2xl font-bold text-slate-200">{simMut.data.simulation.currentlyBlocked}</div>
            </div>
            <div className="rg-card">
              <div className="text-xs text-slate-400">Simulated Blocked</div>
              <div className="mt-1 text-2xl font-bold text-amber-300">{simMut.data.simulation.simulatedBlocked}</div>
            </div>
            <div className="rg-card">
              <div className="text-xs text-slate-400">Additional Blocks (Delta)</div>
              <div className="mt-1 text-2xl font-bold text-rose-400">+{simMut.data.simulation.deltaBlocked}</div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
