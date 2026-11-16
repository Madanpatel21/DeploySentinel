'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, FileKey2, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, RiskBadge, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function ReleaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [rationale, setRationale] = useState('Reviewed 8-dimension risk score, SQL lock safety, and SBOM attestation.');

  const detailQ = useQuery({
    queryKey: ['release', id],
    queryFn: () => apiFetch<{
      release: {
        id: string; version: string; git_sha: string; title: string; description: string;
        status: string; risk_score: number; risk_level: string; confidence: number; completeness: number;
        scoring_version: string; passport_signature: string; author_email: string;
        factor_breakdown: Array<{ dimension: string; weight: number; contribution: number; explanation: string; evidence: string[] }>;
        projects?: { name: string }; environments?: { name: string; tier: string };
      };
      policyEvaluations: Array<{ id: string; policy_name: string; verdict: string; reasons: string[] }>;
      sqlMigrations: Array<{ id: string; filename: string; lock_risk: string; destructive_ops: string[] }>;
      sboms: Array<{ id: string; format: string; components_count: number; vulnerabilities: Array<{ id: string; severity: string; packageName: string }> }>;
      approvals: Array<{ id: string; decision: string; rationale: string; sod_verified: boolean; decided_at: string }>;
    }>(`/releases/${id}`),
  });

  const explainMut = useMutation({
    mutationFn: () => apiFetch<{ explanation: { executiveSummary: string; observedRiskDrivers: string[]; recommendedNextActions: string[]; injectionAttemptDetected: boolean; authoritativeDisclaimer: string } }>(`/releases/${id}/explain`, { method: 'POST' }),
  });

  const approveMut = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') =>
      apiFetch(`/releases/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ decision, rationale }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['release', id] }),
  });

  const rel = detailQ.data?.release;

  return (
    <AppShell title={rel ? `Release ${rel.version}` : 'Release Detail'} subtitle="Deployment Readiness Passport, 8-dimension factor attribution & Separation-of-Duties gate">
      {detailQ.isLoading ? (
        <LoadingState />
      ) : detailQ.error ? (
        <ErrorState message={(detailQ.error as Error).message} />
      ) : rel ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/releases" className="rg-btn-secondary">
              <ArrowLeft className="h-4 w-4" /> Back to Releases
            </Link>
            <div className="flex items-center gap-2">
              <RiskBadge level={rel.risk_level} />
              <StatusBadge status={rel.status} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rg-card lg:col-span-2 space-y-3">
              <h2 className="text-lg font-bold text-white">{rel.title}</h2>
              <p className="text-xs text-slate-400">{rel.description || 'No release notes supplied.'}</p>
              <div className="flex flex-wrap gap-4 pt-2 text-xs text-slate-300">
                <span>Project: <strong className="text-white">{rel.projects?.name}</strong></span>
                <span>Env: <strong className="text-white">{rel.environments?.name ?? 'default'}</strong></span>
                <span>SHA: <code className="text-blue-300">{rel.git_sha.slice(0, 12)}</code></span>
                <span>Author: <strong className="text-white">{rel.author_email}</strong></span>
              </div>
            </div>

            <div className="rg-card flex flex-col justify-between border-blue-500/30">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                  <FileKey2 className="h-4 w-4" /> Deployment Readiness Passport
                </div>
                <div className="mt-2 text-3xl font-extrabold text-white">{rel.risk_score} <span className="text-sm font-normal text-slate-400">/ 100</span></div>
                <div className="mt-1 text-xs text-slate-400">
                  Engine {rel.scoring_version} · Confidence {(rel.confidence * 100).toFixed(0)}% · Completeness {(rel.completeness * 100).toFixed(0)}%
                </div>
              </div>
              <div className="mt-3 rounded bg-slate-950 p-2 font-mono text-[10px] text-emerald-300 break-all">
                HMAC-SHA256: {rel.passport_signature}
              </div>
            </div>
          </div>

          <div className="rg-card">
            <h3 className="mb-4 text-sm font-semibold text-white">Deterministic 8-Dimension Risk Breakdown</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {(rel.factor_breakdown ?? []).map((f) => (
                <div key={f.dimension} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">{f.dimension}</span>
                    <span className="font-mono font-bold text-blue-400">+{f.contribution} / {f.weight}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{f.explanation}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rg-card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Sparkles className="h-4 w-4 text-indigo-400" /> AI Risk Explanation (Advisory Only)
                </h3>
                <button onClick={() => explainMut.mutate()} disabled={explainMut.isPending} className="rg-btn-secondary text-xs">
                  {explainMut.isPending ? 'Synthesizing...' : 'Generate Explanation'}
                </button>
              </div>
              {explainMut.data ? (
                <div className="space-y-2 text-xs">
                  {explainMut.data.explanation.injectionAttemptDetected && (
                    <div className="rounded bg-amber-500/15 p-2 text-amber-300">Prompt-injection directive detected &amp; neutralized in untrusted metadata.</div>
                  )}
                  <p className="text-slate-200">{explainMut.data.explanation.executiveSummary}</p>
                  <ul className="list-disc pl-4 text-slate-400">
                    {explainMut.data.explanation.recommendedNextActions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                  <div className="text-[11px] italic text-slate-500">{explainMut.data.explanation.authoritativeDisclaimer}</div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Click Generate Explanation to run prompt-injection-hardened synthesis from deterministic factors.</p>
              )}
            </div>

            <div className="rg-card space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> Separation-of-Duties Release Gate
              </h3>
              <input value={rationale} onChange={(e) => setRationale(e.target.value)} className="rg-input" placeholder="Approval / rejection rationale..." />
              {approveMut.error && <div className="rounded bg-rose-500/15 p-2 text-xs text-rose-300">{(approveMut.error as Error).message}</div>}
              <div className="flex gap-2">
                <button onClick={() => approveMut.mutate('APPROVED')} disabled={approveMut.isPending} className="rg-btn-primary">
                  <CheckCircle2 className="h-4 w-4" /> Approve Release
                </button>
                <button onClick={() => approveMut.mutate('REJECTED')} disabled={approveMut.isPending} className="rg-btn-secondary text-rose-300">
                  <XCircle className="h-4 w-4" /> Reject / Block
                </button>
              </div>
              <div className="space-y-1.5 pt-2">
                {(detailQ.data?.approvals ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded bg-slate-950 px-2.5 py-1.5 text-xs">
                    <span className="text-slate-300">{a.decision} · {a.rationale}</span>
                    <span className="text-emerald-400">{a.sod_verified ? 'SoD Verified' : 'Pending'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
