'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth, type SessionUser } from '@/components/Providers';

export default function RegisterPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [organizationName, setOrganizationName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ token: string; user: SessionUser }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ organizationName, fullName, email, password }),
      });
      setSession(res.token, res.user);
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message);
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
          <h1 className="text-2xl font-bold text-white">Create Organization Tenant</h1>
          <p className="mt-1 text-xs text-slate-400">Provisions an isolated multi-tenant workspace with RLS &amp; ORG_OWNER RBAC</p>
        </div>

        <form onSubmit={handleSubmit} className="rg-card space-y-4">
          {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Organization Name</label>
            <input type="text" required value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Nova Platform Inc" className="rg-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Full Name</label>
            <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Rivera" className="rg-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Work Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@novaplatform.io" className="rg-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Password (min 8 chars)</label>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="rg-input" />
          </div>
          <button type="submit" disabled={submitting} className="rg-btn-primary w-full">
            {submitting ? 'Provisioning Tenant...' : 'Create Workspace'} <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <p className="text-center text-xs text-slate-400">
          Already registered? <Link href="/login" className="text-blue-400 hover:underline">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
