'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, CheckCircle2, Rocket, ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, RiskBadge, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function DashboardPage() {
  const releasesQ = useQuery({
    queryKey: ['releases'],
    queryFn: () => apiFetch<{ releases: Array<{ id: string; version: string; title: string; risk_score: number; risk_level: string; status: string; projects?: { name: string } }> }>('/releases'),
  });
  const incidentsQ = useQuery({
    queryKey: ['incidents'],
    queryFn: () => apiFetch<{ incidents: Array<{ id: string; title: string; severity: string; status: string }> }>('/incidents'),
  });
  const deploymentsQ = useQuery({
    queryKey: ['deployments'],
    queryFn: () => apiFetch<{ deployments: Array<{ id: string; status: string; health_verdict: string; rollback_recommended: boolean }> }>('/deployments'),
  });
  const doraQ = useQuery({
    queryKey: ['dora'],
    queryFn: () => apiFetch<{ summary: { doraTier: string; changeFailureRatePct: number; avgLeadTimeHours: number; avgMttrHours: number } }>('/dora'),
  });

  const loading = releasesQ.isLoading || incidentsQ.isLoading || deploymentsQ.isLoading;
  const error = releasesQ.error || incidentsQ.error || deploymentsQ.error;

  const releases = releasesQ.data?.releases ?? [];
  const incidents = incidentsQ.data?.incidents ?? [];
  const deployments = deploymentsQ.data?.deployments ?? [];

  const avgRisk = releases.length
    ? (releases.reduce((s, r) => s + Number(r.risk_score), 0) / releases.length).toFixed(1)
    : '0';

  const chartData = releases.slice(0, 8).map((r) => ({
    name: r.version,
    risk: Number(r.risk_score),
  }));

  return (
    <AppShell title="Executive & SRE Control Plane" subtitle="Real-time deterministic release intelligence, governance gates & progressive delivery health">
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rg-card">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Analyzed Releases</span>
                <Rocket className="h-4 w-4 text-blue-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{releases.length}</div>
              <div className="mt-1 text-xs text-slate-400">Avg Risk Score: <span className="font-semibold text-slate-200">{avgRisk}/100</span></div>
            </div>

            <div className="rg-card">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Active Deployments</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{deployments.length}</div>
              <div className="mt-1 text-xs text-amber-300">
                {deployments.filter((d) => d.rollback_recommended).length} rollback recommended
              </div>
            </div>

            <div className="rg-card">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Open Incidents</span>
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">
                {incidents.filter((i) => i.status !== 'RESOLVED').length}
              </div>
              <div className="mt-1 text-xs text-slate-400">{incidents.length} total tracked</div>
            </div>

            <div className="rg-card">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>DORA Performance Tier</span>
                <ShieldAlert className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-400">{doraQ.data?.summary.doraTier ?? 'HIGH'}</div>
              <div className="mt-1 text-xs text-slate-400">
                CFR {doraQ.data?.summary.changeFailureRatePct ?? 0}% · MTTR {doraQ.data?.summary.avgMttrHours ?? 0}h
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rg-card lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Release Risk Score Trajectory</h2>
                <Link href="/releases" className="text-xs text-blue-400 hover:underline">View all releases</Link>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} />
                    <Bar dataKey="risk" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rg-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Recent Incidents</h2>
                <Link href="/incidents" className="text-xs text-blue-400 hover:underline">Investigate</Link>
              </div>
              <div className="space-y-3">
                {incidents.slice(0, 5).map((inc) => (
                  <div key={inc.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="rg-badge bg-rose-500/15 text-rose-300">{inc.severity}</span>
                      <StatusBadge status={inc.status} />
                    </div>
                    <div className="mt-1.5 text-xs font-medium text-slate-200">{inc.title}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rg-card overflow-x-auto">
            <h2 className="mb-4 text-sm font-semibold text-white">Recent Release Evaluations</h2>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2">Version</th>
                  <th className="pb-2">Project</th>
                  <th className="pb-2">Title</th>
                  <th className="pb-2">Risk Score</th>
                  <th className="pb-2">Risk Level</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {releases.slice(0, 8).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/50">
                    <td className="py-2.5 font-mono font-semibold text-blue-400">
                      <Link href={`/releases/${r.id}`} className="hover:underline">{r.version}</Link>
                    </td>
                    <td className="py-2.5 text-slate-300">{r.projects?.name ?? '—'}</td>
                    <td className="py-2.5 text-slate-200">{r.title}</td>
                    <td className="py-2.5 font-semibold text-white">{r.risk_score}</td>
                    <td className="py-2.5"><RiskBadge level={r.risk_level} /></td>
                    <td className="py-2.5"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
