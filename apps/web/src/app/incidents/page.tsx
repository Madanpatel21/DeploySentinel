'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function IncidentsPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('SEV2');

  const incidentsQ = useQuery({
    queryKey: ['incidents'],
    queryFn: () => apiFetch<{ incidents: Array<{ id: string; title: string; severity: string; status: string; observed_evidence: string[]; causal_hypotheses: Array<{ rank: number; hypothesis: string; confidence: number }>; postmortem_md: string; releases?: { version: string } }> }>('/incidents'),
  });
  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<{ projects: Array<{ id: string; name: string }> }>('/projects'),
  });

  const createMut = useMutation({
    mutationFn: () => apiFetch('/incidents', {
      method: 'POST',
      body: JSON.stringify({
        projectId: projectsQ.data?.projects[0]?.id,
        title,
        severity,
        errorRateRatio: 3.2,
        latencyDeltaPct: 65,
      }),
    }),
    onSuccess: () => {
      setTitle('');
      qc.invalidateQueries({ queryKey: ['incidents'] });
    },
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/incidents/${id}/resolve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  });

  return (
    <AppShell title="Incident Intelligence & Autonomous Investigation" subtitle="Separating observed telemetry evidence from ranked causal hypotheses + blameless postmortems">
      <div className="space-y-6">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }} className="rg-card flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs text-slate-400">Incident Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Payments DB Pool Exhaustion" className="rg-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rg-input">
              <option value="SEV1">SEV1</option>
              <option value="SEV2">SEV2</option>
              <option value="SEV3">SEV3</option>
            </select>
          </div>
          <button type="submit" disabled={createMut.isPending} className="rg-btn-primary">
            <Plus className="h-4 w-4" /> Investigate Incident
          </button>
        </form>

        {incidentsQ.isLoading ? <LoadingState /> : incidentsQ.error ? <ErrorState message={(incidentsQ.error as Error).message} /> : (
          <div className="space-y-4">
            {(incidentsQ.data?.incidents ?? []).map((inc) => (
              <div key={inc.id} className="rg-card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    <span className="font-semibold text-white">{inc.title}</span>
                    <span className="rg-badge bg-rose-500/15 text-rose-300">{inc.severity}</span>
                    <StatusBadge status={inc.status} />
                  </div>
                  {inc.status !== 'RESOLVED' && (
                    <button onClick={() => resolveMut.mutate(inc.id)} className="rg-btn-secondary py-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Mark Resolved
                    </button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 text-xs">
                  <div className="rounded-lg border border-emerald-500/20 bg-slate-950 p-3">
                    <div className="mb-1.5 font-semibold text-emerald-300">Observed Telemetry Evidence</div>
                    <ul className="list-disc pl-4 space-y-1 text-slate-300">
                      {inc.observed_evidence?.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-amber-500/20 bg-slate-950 p-3">
                    <div className="mb-1.5 font-semibold text-amber-300">Ranked Causal Hypotheses (Inferred)</div>
                    <ul className="space-y-1.5 text-slate-300">
                      {inc.causal_hypotheses?.map((h) => (
                        <li key={h.rank}>
                          <strong>#{h.rank} ({Math.round(h.confidence * 100)}%):</strong> {h.hypothesis}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
