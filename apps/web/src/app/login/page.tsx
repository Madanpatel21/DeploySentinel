'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, KeyRound, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth, type SessionUser } from '@/components/Providers';

const DEMO_PERSONAS = [
  { label: 'Org Owner (Acme)', email: 'owner@acme.deploysentinel.io', role: 'ORG_OWNER' },
  { label: 'Release Manager', email: 'relmgr@acme.deploysentinel.io', role: 'RELEASE_MANAGER' },
  { label: 'SRE On-Call', email: 'sre@acme.deploysentinel.io', role: 'SRE_ONCALL' },
  { label: 'Security Admin', email: 'sec@acme.deploysentinel.io', role: 'SECURITY_ADMIN' },
  { label: 'Developer', email: 'dev@acme.deploysentinel.io', role: 'DEVELOPER' },
  { label: 'Auditor', email: 'auditor@acme.deploysentinel.io', role: 'AUDITOR' },
];

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState('owner@acme.deploysentinel.io');
  const [password, setPassword] = useState('DeploySentinel!2026');
  const [totpCode, setTotpCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ token: string; user: SessionUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) }),
      });
      setSession(res.token, res.user);
      router.push('/dashboard');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.toLowerCase().includes('mfa')) setMfaRequired(true);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090d16] px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-white">Sign in to DeploySentinel</h1>
          <p className="mt-1 text-xs text-slate-400">Real JWT + bcrypt + TOTP MFA authentication against Supabase PG17</p>
        </div>

        <form onSubmit={handleSubmit} className="rg-card space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Work Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rg-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="rg-input" />
          </div>
          {mfaRequired && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">TOTP MFA Code</label>
              <input type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="6-digit code" className="rg-input" />
            </div>
          )}
          <button type="submit" disabled={submitting} className="rg-btn-primary w-full">
            {submitting ? 'Authenticating...' : 'Sign In'} <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="rg-card">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <KeyRound className="h-3.5 w-3.5 text-blue-400" /> RBAC Demo Personas (Real Seeded Accounts)
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_PERSONAS.map((p) => (
              <button
                key={p.email}
                type="button"
                onClick={() => {
                  setEmail(p.email);
                  setPassword('DeploySentinel!2026');
                }}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-left text-[11px] hover:border-blue-500/50"
              >
                <div className="font-medium text-slate-200">{p.label}</div>
                <div className="text-[10px] text-slate-500">{p.role}</div>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">
          Need a new organization?{' '}
          <Link href="/register" className="text-blue-400 hover:underline">Create Tenant Workspace</Link>
        </p>
      </div>
    </div>
  );
}
