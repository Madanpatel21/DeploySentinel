'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function BlastRadiusPage() {
  const [idx, setIdx] = useState(0);
  const { data, isLoading, error } = useQuery({
    queryKey: ['releases'],
    queryFn: () => apiFetch<{ releases: Array<{ id: string; version: string; blast_radius: { directlyImpactedServices: string[]; downstreamTransitiveServices: string[]; impactedApiContracts: string[]; impactedDatastores: string[]; blastRadiusScore: number; graphNodes: Array<{ id: string; label: string; impact: string }> } }> }>('/releases'),
  });

  const releases = data?.releases ?? [];
  const blast = releases[idx]?.blast_radius;

  return (
    <AppShell title="Release Blast-Radius Simulator" subtitle="Transitive service dependency closure, API contract & datastore ripple analysis">
      {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : (
        <div className="space-y-6">
          <div className="rg-card flex items-center gap-3">
            <Network className="h-4 w-4 text-blue-400" />
            <select value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="rg-input max-w-xs">
              {releases.map((r, i) => <option key={r.id} value={i}>{r.version}</option>)}
            </select>
            <div className="text-xs text-slate-300">
              Blast Radius Score: <strong className="text-white">{blast?.blastRadiusScore ?? 0}/100</strong>
            </div>
          </div>

          {blast && (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rg-card">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-300">Directly Impacted Services</h3>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-200">
                  {blast.directlyImpactedServices?.map((s) => <li key={s} className="rounded bg-rose-500/10 px-2.5 py-1.5">{s}</li>)}
                </ul>
              </div>
              <div className="rg-card">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">Transitive Downstream Consumers</h3>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-200">
                  {(blast.downstreamTransitiveServices?.length ? blast.downstreamTransitiveServices : ['None']).map((s) => (
                    <li key={s} className="rounded bg-amber-500/10 px-2.5 py-1.5">{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rg-card">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-300">Impacted Datastores &amp; APIs</h3>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-200">
                  {(blast.impactedDatastores ?? []).map((s) => <li key={s} className="rounded bg-blue-500/10 px-2.5 py-1.5">{s}</li>)}
                  {(blast.impactedApiContracts ?? []).map((s) => <li key={s} className="rounded bg-slate-800 px-2.5 py-1.5">{s}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
