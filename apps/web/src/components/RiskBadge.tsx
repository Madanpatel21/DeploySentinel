'use client';

import React from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';

export function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    LOW: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
    MEDIUM: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
    HIGH: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30',
    CRITICAL: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
  };
  return <span className={`rg-badge ${styles[level] ?? 'bg-slate-800 text-slate-300'}`}>{level}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    APPROVED: 'bg-emerald-500/15 text-emerald-300',
    DEPLOYED: 'bg-emerald-500/15 text-emerald-300',
    PROMOTED: 'bg-emerald-500/15 text-emerald-300',
    HEALTHY: 'bg-emerald-500/15 text-emerald-300',
    COMPLIANT: 'bg-emerald-500/15 text-emerald-300',
    CONNECTED: 'bg-emerald-500/15 text-emerald-300',
    PASS: 'bg-emerald-500/15 text-emerald-300',
    AWAITING_APPROVAL: 'bg-amber-500/15 text-amber-300',
    CANARY_ACTIVE: 'bg-blue-500/15 text-blue-300',
    INVESTIGATING: 'bg-amber-500/15 text-amber-300',
    WARN: 'bg-amber-500/15 text-amber-300',
    PARTIAL: 'bg-amber-500/15 text-amber-300',
    SIMULATOR: 'bg-indigo-500/15 text-indigo-300',
    BLOCKED: 'bg-rose-500/15 text-rose-300',
    BLOCK: 'bg-rose-500/15 text-rose-300',
    DEGRADED: 'bg-rose-500/15 text-rose-300',
    CRITICAL: 'bg-rose-500/15 text-rose-300',
    ROLLED_BACK: 'bg-rose-500/15 text-rose-300',
  };
  return <span className={`rg-badge ${styles[status] ?? 'bg-slate-800 text-slate-300'}`}>{status}</span>;
}

export function LoadingState({ message = 'Loading DeploySentinel telemetry...' }: { message?: string }) {
  return (
    <div className="rg-card flex items-center justify-center py-12 text-sm text-slate-400">
      <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-400" />
      {message}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
      <div className="flex items-center gap-2 font-medium">
        <AlertCircle className="h-4 w-4 text-rose-400" />
        <span>Error: {message}</span>
      </div>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rg-card flex flex-col items-center justify-center py-12 text-center">
      <Inbox className="mb-2 h-8 w-8 text-slate-600" />
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-slate-400">{description}</p>
    </div>
  );
}
