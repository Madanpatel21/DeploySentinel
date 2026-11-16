'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackageCheck, ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, RiskBadge, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function SupplyChainPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sboms'],
    queryFn: () => apiFetch<{ sboms: Array<{ id: string; format: string; spec_version: string; components_count: number; slsa_level: number; signature_verified: boolean; vulnerabilities: Array<{ id: string; packageName: string; installedVersion: string; fixedVersion: string; severity: string; cvss: number; summary: string }>; license_violations: Array<{ packageName: string; license: string }>; releases?: { version: string; title: string } }> }>('/sboms'),
  });

  return (
    <AppShell title="Software Supply Chain & SBOM Security" subtitle="CycloneDX 1.5 / SPDX 2.3 inventory, CVE correlation & SLSA provenance verification">
      {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : (
        <div className="space-y-4">
          {(data?.sboms ?? []).map((s) => (
            <div key={s.id} className="rg-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-blue-400" />
                  <span className="font-semibold text-white">{s.releases?.version ?? 'Artifact'}</span>
                  <span className="rg-badge bg-slate-800 text-slate-300">{s.format.toUpperCase()} {s.spec_version}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">{s.components_count} components</span>
                  <span className="rg-badge bg-indigo-500/20 text-indigo-300">SLSA L{s.slsa_level}</span>
                  <StatusBadge status={s.signature_verified ? 'APPROVED' : 'BLOCKED'} />
                </div>
              </div>

              {s.vulnerabilities?.length > 0 ? (
                <div className="space-y-2">
                  {s.vulnerabilities.map((v) => (
                    <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-rose-400" />
                        <span className="font-mono font-bold text-rose-200">{v.id}</span>
                        <span className="text-slate-200">{v.packageName}@{v.installedVersion} → Fix {v.fixedVersion}</span>
                      </div>
                      <RiskBadge level={v.severity} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-emerald-400">Zero known CVEs detected in dependency graph.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
