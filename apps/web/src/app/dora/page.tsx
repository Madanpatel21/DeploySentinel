'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function DoraPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dora'],
    queryFn: () => apiFetch<{
      summary: { ethicalGuarantee: string; totalDeployments: number; avgDeploysPerDay: number; avgLeadTimeHours: number; changeFailureRatePct: number; avgMttrHours: number; doraTier: string; primaryBottleneck: string };
      series: Array<{ metric_date: string; deploy_count: number; lead_time_hours: number; change_failure_rate: number; mttr_hours: number }>;
    }>('/dora'),
  });

  const s = data?.summary;

  return (
    <AppShell title="Developer Experience & Ethical DORA Metrics" subtitle="Team & service-level flow metrics with strict prohibition on individual developer surveillance">
      {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : s && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Ethical Safeguard Active: <strong>{s.ethicalGuarantee}</strong> — Metrics are aggregated exclusively at project and organization scope.</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rg-card"><div className="text-xs text-slate-400">Deploy Frequency</div><div className="mt-1 text-2xl font-bold text-white">{s.avgDeploysPerDay}/day</div></div>
            <div className="rg-card"><div className="text-xs text-slate-400">Lead Time for Changes</div><div className="mt-1 text-2xl font-bold text-blue-400">{s.avgLeadTimeHours}h</div></div>
            <div className="rg-card"><div className="text-xs text-slate-400">Change Failure Rate</div><div className="mt-1 text-2xl font-bold text-amber-300">{s.changeFailureRatePct}%</div></div>
            <div className="rg-card"><div className="text-xs text-slate-400">Mean Time to Restore</div><div className="mt-1 text-2xl font-bold text-emerald-400">{s.avgMttrHours}h</div></div>
          </div>

          <div className="rg-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><BarChart3 className="h-4 w-4 text-blue-400" /> Lead Time &amp; Deployments Trend</h2>
              <span className="text-xs text-slate-400">Primary Bottleneck: <strong className="text-amber-300">{s.primaryBottleneck}</strong></span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.series ?? []}>
                  <XAxis dataKey="metric_date" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="lead_time_hours" stroke="#3b82f6" name="Lead Time (h)" strokeWidth={2} />
                  <Line type="monotone" dataKey="deploy_count" stroke="#10b981" name="Deploys" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
