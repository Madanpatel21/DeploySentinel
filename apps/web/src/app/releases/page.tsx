'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState, ErrorState, LoadingState, RiskBadge, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function ReleasesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [showIngest, setShowIngest] = useState(false);

  const [projectId, setProjectId] = useState('');
  const [version, setVersion] = useState('v2.15.0');
  const [title, setTitle] = useState('Add payment retry backoff & audit index');
  const [sqlText, setSqlText] = useState('CREATE INDEX CONCURRENTLY idx_retry_at ON orders(updated_at);');

  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<{ projects: Array<{ id: string; name: string }> }>('/projects'),
  });

  const releasesQ = useQuery({
    queryKey: ['releases', riskFilter],
    queryFn: () => apiFetch<{ releases: Array<{ id: string; version: string; git_sha: string; title: string; risk_score: number; risk_level: string; status: string; author_email: string; created_at: string; projects?: { name: string } }> }>(`/releases${riskFilter ? `?riskLevel=${riskFilter}` : ''}`),
  });

  const ingestMut = useMutation({
    mutationFn: () =>
      apiFetch('/releases/ingest', {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId || projectsQ.data?.projects[0]?.id,
          version,
          gitSha: Math.random().toString(16).slice(2, 14).padEnd(12, 'a'),
          title,
          changedFiles: [
            { path: 'src/checkout/retry.ts', additions: 85, deletions: 22 },
            { path: 'migrations/20261116_retry_idx.sql', additions: 4, deletions: 0 },
          ],
          sqlMigrations: sqlText.trim() ? [{ filename: '20261116_retry_idx.sql', sql: sqlText }] : [],
          packageJson: { dependencies: { express: '^4.21.1', zod: '^3.23.8' } },
        }),
      }),
    onSuccess: () => {
      setShowIngest(false);
      qc.invalidateQueries({ queryKey: ['releases'] });
    },
  });

  const filtered = (releasesQ.data?.releases ?? []).filter(
    (r) =>
      r.version.toLowerCase().includes(search.toLowerCase()) ||
      r.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell title="Release Intelligence Engine" subtitle="Deterministic pre-release risk scoring, factor breakdown & approval lifecycle">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by version or title..." className="rg-input pl-9" />
            </div>
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="rg-input max-w-[160px]">
              <option value="">All Risk Levels</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <button onClick={() => setShowIngest((v) => !v)} className="rg-btn-primary">
            <Plus className="h-4 w-4" /> Ingest Release
          </button>
        </div>

        {showIngest && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ingestMut.mutate();
            }}
            className="rg-card space-y-3 border-blue-500/40"
          >
            <h2 className="text-sm font-semibold text-white">Ingest Release for Deterministic Risk &amp; Policy Analysis</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <select value={projectId || projectsQ.data?.projects[0]?.id || ''} onChange={(e) => setProjectId(e.target.value)} className="rg-input">
                {(projectsQ.data?.projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input value={version} onChange={(e) => setVersion(e.target.value)} required placeholder="Version (e.g. v2.15.0)" className="rg-input" />
              <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Release title" className="rg-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">SQL Migration DDL (optional — analyzed for locks &amp; destructive ops)</label>
              <textarea rows={2} value={sqlText} onChange={(e) => setSqlText(e.target.value)} className="rg-input font-mono text-xs" />
            </div>
            {ingestMut.error && <div className="text-xs text-rose-400">{(ingestMut.error as Error).message}</div>}
            <div className="flex gap-2">
              <button type="submit" disabled={ingestMut.isPending} className="rg-btn-primary">
                {ingestMut.isPending ? 'Evaluating Engines...' : 'Run DeploySentinel Analysis'}
              </button>
              <button type="button" onClick={() => setShowIngest(false)} className="rg-btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        {releasesQ.isLoading ? (
          <LoadingState />
        ) : releasesQ.error ? (
          <ErrorState message={(releasesQ.error as Error).message} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matching releases" description="Adjust filters or ingest a release to compute risk intelligence." />
        ) : (
          <div className="rg-card overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2">Version</th>
                  <th className="pb-2">Project</th>
                  <th className="pb-2">Title</th>
                  <th className="pb-2">Author</th>
                  <th className="pb-2">Score</th>
                  <th className="pb-2">Risk</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/50">
                    <td className="py-3 font-mono font-semibold text-blue-400">
                      <Link href={`/releases/${r.id}`} className="hover:underline">{r.version}</Link>
                    </td>
                    <td className="py-3 text-slate-300">{r.projects?.name ?? '—'}</td>
                    <td className="py-3 text-slate-100">{r.title}</td>
                    <td className="py-3 text-slate-400">{r.author_email}</td>
                    <td className="py-3 font-bold text-white">{r.risk_score}</td>
                    <td className="py-3"><RiskBadge level={r.risk_level} /></td>
                    <td className="py-3"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
