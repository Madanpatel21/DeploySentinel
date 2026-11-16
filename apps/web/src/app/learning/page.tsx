'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, RiskBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function LearningPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['calibration'],
    queryFn: () => apiFetch<{
      calibration: { sampleCount: number; precision: number; recall: number; f1Score: number; brierScore: number; avgPredictedProb: number; actualIncidentRate: number };
      outcomes: Array<{ id: string; predicted_risk_score: number; predicted_incident_prob: number; actual_incident_occurred: boolean; feedback_delta: number; releases?: { version: string; title: string; risk_level: string } }>;
    }>('/learning/calibration'),
  });

  const c = data?.calibration;

  return (
    <AppShell title="Reliability Learning & Predictive Calibration" subtitle="Closed-loop accuracy metrics (Precision, Recall, F1, Brier Calibration) comparing predictions vs real outcomes">
      {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : c && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rg-card"><div className="text-xs text-slate-400">Precision</div><div className="mt-1 text-2xl font-bold text-white">{(c.precision * 100).toFixed(1)}%</div></div>
            <div className="rg-card"><div className="text-xs text-slate-400">Recall</div><div className="mt-1 text-2xl font-bold text-white">{(c.recall * 100).toFixed(1)}%</div></div>
            <div className="rg-card"><div className="text-xs text-slate-400">F1 Score</div><div className="mt-1 text-2xl font-bold text-blue-400">{c.f1Score}</div></div>
            <div className="rg-card"><div className="text-xs text-slate-400">Brier Score (lower=better)</div><div className="mt-1 text-2xl font-bold text-emerald-400">{c.brierScore}</div></div>
            <div className="rg-card"><div className="text-xs text-slate-400">Sample Size</div><div className="mt-1 text-2xl font-bold text-slate-200">{c.sampleCount}</div></div>
          </div>

          <div className="rg-card overflow-x-auto">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><ShieldAlert className="h-4 w-4 text-blue-400" /> Release Outcome Calibration Log</h2>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2">Release</th>
                  <th className="pb-2">Predicted Risk</th>
                  <th className="pb-2">Predicted Incident Prob</th>
                  <th className="pb-2">Actual Incident</th>
                  <th className="pb-2">Feedback Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {(data?.outcomes ?? []).map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 font-mono text-blue-400">{o.releases?.version}</td>
                    <td className="py-2.5"><RiskBadge level={o.releases?.risk_level ?? 'LOW'} /> ({o.predicted_risk_score})</td>
                    <td className="py-2.5">{(Number(o.predicted_incident_prob) * 100).toFixed(1)}%</td>
                    <td className="py-2.5 font-semibold">{o.actual_incident_occurred ? <span className="text-rose-400">YES</span> : <span className="text-emerald-400">NO</span>}</td>
                    <td className="py-2.5 font-mono">{o.feedback_delta}</td>
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
