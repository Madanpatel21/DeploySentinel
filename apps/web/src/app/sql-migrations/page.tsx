'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Play, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, RiskBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function SqlMigrationsPage() {
  const qc = useQueryClient();
  const [sqlInput, setSqlInput] = useState('ALTER TABLE orders ADD COLUMN tracking_code text NOT NULL;\nCREATE INDEX idx_orders_tracking ON orders(tracking_code);');
  const [filename, setFilename] = useState('20261116_orders_tracking.sql');

  const { data, isLoading, error } = useQuery({
    queryKey: ['sql-migrations'],
    queryFn: () => apiFetch<{ migrations: Array<{ id: string; filename: string; lock_risk: string; destructive_ops: string[]; findings: Array<{ ruleId: string; severity: string; message: string; remediation: string }>; expand_contract_plan: string[]; rollback_sql: string; requires_manual_approval: boolean; approved_at: string | null; releases?: { version: string } }> }>('/sql-migrations'),
  });

  const analyzeMut = useMutation({
    mutationFn: () => apiFetch<{ analysis: { lockRisk: string; findings: Array<{ ruleId: string; severity: string; message: string; remediation: string }>; expandContractPlan: string[]; rollbackSql: string } }>('/sql-migrations/analyze', {
      method: 'POST',
      body: JSON.stringify({ filename, sql: sqlInput }),
    }),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/sql-migrations/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sql-migrations'] }),
  });

  return (
    <AppShell title="Database Migration Intelligence" subtitle="Static DDL lock detector, destructive operation blocker & Expand-and-Contract planner">
      <div className="space-y-6">
        <div className="rg-card space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Database className="h-4 w-4 text-blue-400" /> Interactive SQL Migration Sandbox
          </h2>
          <input value={filename} onChange={(e) => setFilename(e.target.value)} className="rg-input max-w-sm font-mono text-xs" />
          <textarea rows={4} value={sqlInput} onChange={(e) => setSqlInput(e.target.value)} className="rg-input font-mono text-xs" />
          <button onClick={() => analyzeMut.mutate()} disabled={analyzeMut.isPending} className="rg-btn-primary">
            <Play className="h-4 w-4" /> Analyze SQL Safety
          </button>

          {analyzeMut.data && (
            <div className="mt-4 space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs">
              <div className="flex items-center gap-2">
                <span>Lock Risk:</span> <RiskBadge level={analyzeMut.data.analysis.lockRisk} />
              </div>
              {analyzeMut.data.analysis.findings.map((f, i) => (
                <div key={i} className="rounded border border-rose-500/30 bg-rose-500/10 p-2.5">
                  <div className="font-semibold text-rose-200">{f.ruleId} ({f.severity})</div>
                  <div className="mt-0.5 text-slate-300">{f.message}</div>
                  <div className="mt-1 text-emerald-300">Fix: {f.remediation}</div>
                </div>
              ))}
              <div>
                <div className="font-semibold text-slate-200">Expand-and-Contract Plan:</div>
                <ul className="mt-1 list-disc pl-4 text-slate-400">
                  {analyzeMut.data.analysis.expandContractPlan.map((step, i) => <li key={i}>{step}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>

        {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : (
          <div className="space-y-4">
            {(data?.migrations ?? []).map((m) => (
              <div key={m.id} className="rg-card space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-sm font-semibold text-white">{m.filename}</span>
                    <span className="ml-2 text-xs text-slate-400">Release {m.releases?.version}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiskBadge level={m.lock_risk} />
                    {m.approved_at ? (
                      <span className="rg-badge bg-emerald-500/15 text-emerald-300">DBA Approved</span>
                    ) : m.requires_manual_approval ? (
                      <button onClick={() => approveMut.mutate(m.id)} className="rg-btn-secondary py-1 text-xs">
                        <ShieldCheck className="h-3.5 w-3.5" /> Approve Migration
                      </button>
                    ) : null}
                  </div>
                </div>
                {m.findings?.map((f, i) => (
                  <div key={i} className="rounded bg-slate-950 p-2.5 text-xs text-slate-300">
                    <strong className="text-amber-300">{f.ruleId}:</strong> {f.message}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
