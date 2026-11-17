import Link from 'next/link';
import { Check, Shield, ArrowLeft } from 'lucide-react';
import { PLAN_ENTITLEMENTS } from '@deploysentinel/shared';

export default function PricingPage() {
  const plans = Object.values(PLAN_ENTITLEMENTS);
  return (
    <div className="min-h-screen bg-[#090d16] px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" className="rg-btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <Link href="/login" className="rg-btn-primary">
            <Shield className="h-4 w-4" /> Open Console
          </Link>
        </div>

        <div className="text-center">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Transparent Control-Plane Pricing</h1>
          <p className="mt-3 text-sm text-slate-400">
            No per-host APM taxes. Predictable release governance across FREE, STARTER, PROFESSIONAL, and ENTERPRISE tiers.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <div
              key={p.plan}
              className={`rg-card flex flex-col justify-between ${
                p.plan === 'PROFESSIONAL' ? 'border-blue-500/60 ring-1 ring-blue-500/30' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">{p.plan}</span>
                  {p.plan === 'PROFESSIONAL' && (
                    <span className="rg-badge bg-blue-500/20 text-blue-300">Most Popular</span>
                  )}
                </div>
                <div className="mt-4 text-3xl font-extrabold text-white">
                  ${p.monthlyPriceUsd}
                  <span className="text-xs font-normal text-slate-400">/month</span>
                </div>
                <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> {p.maxProjects ?? 'Unlimited'} Projects</li>
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> {p.maxReleasesPerMonth ?? 'Unlimited'} Releases / mo</li>
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> {p.rbacRolesCount} RBAC Roles</li>
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> Policy Simulation: {p.policySimulation ? 'Included' : 'Upgrade'}</li>
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> Canary Gate: {p.canaryStatisticalGate ? 'Included' : 'Upgrade'}</li>
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> {p.retentionDays}d Audit Retention</li>
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> {p.complianceFrameworks.join(', ')}</li>
                </ul>
              </div>
              <Link href="/register" className="rg-btn-primary mt-6 w-full">
                Select {p.plan}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
