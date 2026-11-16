'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileCheck2, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function CompliancePage() {
  const [exportJson, setExportJson] = useState<string>('');

  const compQ = useQuery({
    queryKey: ['compliance'],
    queryFn: () => apiFetch<{ controls: Array<{ id: string; framework: string; control_id: string; title: string; status: string; evidence_count: number }> }>('/compliance'),
  });

  const auditVerifyQ = useQuery({
    queryKey: ['audit-verify'],
    queryFn: () => apiFetch<{ verification: { totalEntries: number; valid: boolean } }>('/audit-logs/verify'),
  });

  const auditLogsQ = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiFetch<{ logs: Array<{ id: string; actor_role: string; action: string; resource_type: string; entry_hash: string; created_at: string }> }>('/audit-logs'),
  });

  async function handleExport() {
    const bundle = await apiFetch('/compliance/export');
    setExportJson(JSON.stringify(bundle, null, 2));
  }

  return (
    <AppShell title="Compliance & Immutable Audit Center" subtitle="SOC 2, ISO 27001, NIST CSF, OWASP ASVS, SLSA & GDPR evidence mapping + SHA-256 audit chain">
      <div className="space-y-6">
        <div className="rg-card flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <span>
              Hash-Chained Audit Log Integrity:{' '}
              <strong className={auditVerifyQ.data?.verification.valid ? 'text-emerald-400' : 'text-rose-400'}>
                {auditVerifyQ.data?.verification.valid ? 'VERIFIED INTACT' : 'CHECKING...'}
              </strong>{' '}
              ({auditVerifyQ.data?.verification.totalEntries ?? 0} chained entries)
            </span>
          </div>
          <button onClick={handleExport} className="rg-btn-primary text-xs">
            <Download className="h-3.5 w-3.5" /> Generate Compliance Evidence Bundle
          </button>
        </div>

        {exportJson && (
          <pre className="max-h-64 overflow-auto rounded-xl border border-emerald-500/30 bg-slate-950 p-4 font-mono text-[11px] text-emerald-200">{exportJson}</pre>
        )}

        {compQ.isLoading ? <LoadingState /> : compQ.error ? <ErrorState message={(compQ.error as Error).message} /> : (
          <div className="rg-card overflow-x-auto">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><FileCheck2 className="h-4 w-4 text-blue-400" /> Regulatory Controls Matrix</h2>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2">Framework</th>
                  <th className="pb-2">Control</th>
                  <th className="pb-2">Title</th>
                  <th className="pb-2">Evidence</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {(compQ.data?.controls ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 font-semibold text-blue-300">{c.framework}</td>
                    <td className="py-2.5 font-mono text-slate-200">{c.control_id}</td>
                    <td className="py-2.5 text-slate-200">{c.title}</td>
                    <td className="py-2.5 text-slate-400">{c.evidence_count} artifacts</td>
                    <td className="py-2.5"><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rg-card overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold text-white">Recent Tamper-Evident Audit Events</h2>
          <div className="space-y-1.5 text-xs">
            {(auditLogsQ.data?.logs ?? []).slice(0, 10).map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-950 px-3 py-2">
                <span><strong className="text-blue-300">{l.action}</strong> · {l.actor_role} · {l.resource_type}</span>
                <code className="text-[10px] text-slate-500">sha256:{l.entry_hash.slice(0, 20)}...</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
