'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function CrossProjectPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cross-project'],
    queryFn: () => apiFetch<{
      projectCount: number;
      totalOrgVulnerabilities: number;
      projects: Array<{ id: string; name: string; serviceTier: string; releaseCount: number; avgRiskScore: number }>;
      sharedDependencyHotspots: Array<{ pathPrefix: string; touches: number }>;
    }>('/cross-project'),
  });

  return (
    <AppShell title="Cross-Project Reliability Intelligence" subtitle="Organization-wide service risk comparison & shared code hotspot analysis">
      {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rg-card"><div className="text-xs text-slate-400">Monitored Projects</div><div className="mt-1 text-2xl font-bold text-white">{data.projectCount}</div></div>
            <div className="rg-card"><div className="text-xs text-slate-400">Total Org CVEs Detected</div><div className="mt-1 text-2xl font-bold text-amber-300">{data.totalOrgVulnerabilities}</div></div>
            <div className="rg-card"><div className="text-xs text-slate-400">Top Shared Hotspot</div><div className="mt-1 font-mono text-sm font-bold text-blue-400">{data.sharedDependencyHotspots[0]?.pathPrefix ?? '—'}</div></div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rg-card space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Box className="h-4 w-4 text-blue-400" /> Service Risk Comparison</h2>
              {data.projects.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded bg-slate-950 px-3 py-2 text-xs">
                  <div>
                    <span className="font-semibold text-white">{p.name}</span>
                    <span className="ml-2 text-slate-400">({p.serviceTier})</span>
                  </div>
                  <div className="text-slate-300">{p.releaseCount} releases · Avg Risk <strong className="text-white">{p.avgRiskScore}</strong></div>
                </div>
              ))}
            </div>

            <div className="rg-card space-y-2">
              <h2 className="text-sm font-semibold text-white">Shared Directory &amp; Dependency Hotspots</h2>
              {data.sharedDependencyHotspots.map((h) => (
                <div key={h.pathPrefix} className="flex items-center justify-between rounded bg-slate-950 px-3 py-2 text-xs">
                  <span className="font-mono text-blue-300">{h.pathPrefix}</span>
                  <span className="font-semibold text-slate-200">{h.touches} release touches</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
