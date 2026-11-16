'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function ReplayPage() {
  const [selectedId, setSelectedId] = useState('');

  const releasesQ = useQuery({
    queryKey: ['releases'],
    queryFn: () => apiFetch<{ releases: Array<{ id: string; version: string }> }>('/releases'),
  });

  const targetId = selectedId || releasesQ.data?.releases[0]?.id;

  const replayQ = useQuery({
    queryKey: ['replay', targetId],
    enabled: Boolean(targetId),
    queryFn: () => apiFetch<{ version: string; timeline: Array<{ timestamp: string; stage: string; title: string; severity: string; details: string }> }>(`/releases/${targetId}/replay`),
  });

  return (
    <AppShell title="Release Replay Engine" subtitle="Synchronized chronological reconstruction from commit through deployment, anomaly & remediation">
      <div className="space-y-6">
        <div className="rg-card flex items-center gap-3">
          <History className="h-4 w-4 text-blue-400" />
          <select value={targetId ?? ''} onChange={(e) => setSelectedId(e.target.value)} className="rg-input max-w-xs">
            {(releasesQ.data?.releases ?? []).map((r) => <option key={r.id} value={r.id}>{r.version}</option>)}
          </select>
        </div>

        {replayQ.isLoading ? <LoadingState /> : replayQ.error ? <ErrorState message={(replayQ.error as Error).message} /> : (
          <div className="rg-card space-y-4">
            {(replayQ.data?.timeline ?? []).map((ev, i) => (
              <div key={i} className="flex gap-4 border-l-2 border-blue-500/40 pl-4">
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rg-badge bg-slate-800 text-blue-300">{ev.stage}</span>
                    <StatusBadge status={ev.severity} />
                    <span className="text-[11px] text-slate-500">{new Date(ev.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-sm font-semibold text-white">{ev.title}</div>
                  <p className="text-xs text-slate-400">{ev.details}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
