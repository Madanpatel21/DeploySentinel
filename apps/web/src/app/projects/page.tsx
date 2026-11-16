'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderGit2, Plus, Terminal } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  repo_url: string;
  service_tier: string;
  auto_rollback_enabled: boolean;
  environments: Array<{ id: string; name: string; tier: string; risk_threshold: number; require_approval: boolean }>;
}

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [serviceTier, setServiceTier] = useState('TIER_1');
  const [repoPath, setRepoPath] = useState('/home/user/releaseguard');
  const [scanResult, setScanResult] = useState<string>('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<{ projects: ProjectRow[] }>('/projects'),
  });

  const createMut = useMutation({
    mutationFn: () => apiFetch('/projects', { method: 'POST', body: JSON.stringify({ name, repoUrl, serviceTier }) }),
    onSuccess: () => {
      setName('');
      setRepoUrl('');
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const scanMut = useMutation({
    mutationFn: (projectId: string) =>
      apiFetch<{ release: { version: string; risk_score: number; risk_level: string }; inspection: { changedFiles: unknown[] } }>(
        '/projects/scan-local-repo',
        { method: 'POST', body: JSON.stringify({ projectId, repoPath }) }
      ),
    onSuccess: (res) => {
      setScanResult(`Scanned ${res.inspection.changedFiles.length} files -> Release ${res.release.version} (Risk ${res.release.risk_score} ${res.release.risk_level})`);
      qc.invalidateQueries({ queryKey: ['releases'] });
    },
  });

  return (
    <AppShell title="Projects, Environments & Git Scanner" subtitle="Manage monitored services, environment thresholds, and scan real local Git repositories">
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate();
            }}
            className="rg-card space-y-3"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Plus className="h-4 w-4 text-blue-400" /> Register New Service Project
            </h2>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Service Name (e.g. Orders Fulfillment API)" className="rg-input" />
            <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="Repository URL (optional)" className="rg-input" />
            <select value={serviceTier} onChange={(e) => setServiceTier(e.target.value)} className="rg-input">
              <option value="TIER_0">TIER_0 (Mission Critical)</option>
              <option value="TIER_1">TIER_1 (Core Service)</option>
              <option value="TIER_2">TIER_2 (Internal)</option>
            </select>
            {createMut.error && <div className="text-xs text-rose-400">{(createMut.error as Error).message}</div>}
            <button type="submit" disabled={createMut.isPending} className="rg-btn-primary">
              {createMut.isPending ? 'Creating...' : 'Create Project & Default Environments'}
            </button>
          </form>

          <div className="rg-card space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Terminal className="h-4 w-4 text-emerald-400" /> Real Local Git Repository Scanner
            </h2>
            <p className="text-xs text-slate-400">
              Executes real <code className="text-slate-200">git rev-parse / diff / package.json / *.sql</code> inspection on a workspace path and ingests a deterministic release.
            </p>
            <input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} className="rg-input" placeholder="/home/user/releaseguard" />
            {scanResult && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">{scanResult}</div>}
            {scanMut.error && <div className="text-xs text-rose-400">{(scanMut.error as Error).message}</div>}
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={(error as Error).message} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(data?.projects ?? []).map((p) => (
              <div key={p.id} className="rg-card flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-white">
                      <FolderGit2 className="h-4 w-4 text-blue-400" />
                      <span>{p.name}</span>
                    </div>
                    <span className="rg-badge bg-slate-800 text-blue-300">{p.service_tier}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">Slug: {p.slug}</div>
                  <div className="mt-3 space-y-1.5">
                    {p.environments?.map((env) => (
                      <div key={env.id} className="flex items-center justify-between rounded bg-slate-950/70 px-2.5 py-1.5 text-xs">
                        <span className="font-medium text-slate-200">{env.name} ({env.tier})</span>
                        <span className="text-slate-400">Threshold {env.risk_threshold} · {env.require_approval ? 'Approval Req' : 'Auto'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => scanMut.mutate(p.id)}
                  disabled={scanMut.isPending}
                  className="rg-btn-secondary w-full text-xs"
                >
                  <Terminal className="h-3.5 w-3.5" /> Scan Local Git Repo into {p.slug}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
