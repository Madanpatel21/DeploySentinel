'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Scale } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, LoadingState, StatusBadge } from '@/components/RiskBadge';
import { apiFetch } from '@/lib/api';

export default function GovernancePage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [maxRiskScore, setMaxRiskScore] = useState(65);
  const [category, setCategory] = useState('RISK');
  const [severity, setSeverity] = useState('BLOCK');

  const { data, isLoading, error } = useQuery({
    queryKey: ['policies'],
    queryFn: () => apiFetch<{ policies: Array<{ id: string; name: string; description: string; category: string; mode: string; severity: string; rule_dsl: Record<string, unknown>; enabled: boolean }> }>('/policies'),
  });

  const createMut = useMutation({
    mutationFn: () => apiFetch('/policies', {
      method: 'POST',
      body: JSON.stringify({ name, category, severity, mode: 'enforce', ruleDsl: { maxRiskScore: Number(maxRiskScore) } }),
    }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['policies'] });
    },
  });

  return (
    <AppShell title="Release Governance & Policy-as-Code" subtitle="Enforce deterministic OPA-style gates, Separation of Duties & release ceilings">
      <div className="space-y-6">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }} className="rg-card space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Plus className="h-4 w-4 text-blue-400" /> Author Governance Policy</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Policy Name" className="rg-input" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rg-input">
              <option value="RISK">RISK</option>
              <option value="SECURITY">SECURITY</option>
              <option value="DATABASE">DATABASE</option>
              <option value="GOVERNANCE">GOVERNANCE</option>
            </select>
            <input type="number" min={10} max={100} value={maxRiskScore} onChange={(e) => setMaxRiskScore(Number(e.target.value))} className="rg-input" placeholder="Max Risk Score" />
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rg-input">
              <option value="BLOCK">BLOCK</option>
              <option value="WARN">WARN</option>
            </select>
          </div>
          {createMut.error && <div className="text-xs text-rose-400">{(createMut.error as Error).message}</div>}
          <button type="submit" disabled={createMut.isPending} className="rg-btn-primary">Save Policy Rule</button>
        </form>

        {isLoading ? <LoadingState /> : error ? <ErrorState message={(error as Error).message} /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {(data?.policies ?? []).map((p) => (
              <div key={p.id} className="rg-card space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Scale className="h-4 w-4 text-blue-400" /> {p.name}
                  </div>
                  <StatusBadge status={p.severity} />
                </div>
                <p className="text-xs text-slate-400">{p.description}</p>
                <div className="rounded bg-slate-950 p-2 font-mono text-[11px] text-blue-300">{JSON.stringify(p.rule_dsl)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
