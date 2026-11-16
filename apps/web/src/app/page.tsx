import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Cpu,
  Database,
  FileCheck2,
  GitBranch,
  Lock,
  Network,
  PackageCheck,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';

const CAPABILITIES = [
  { icon: Cpu, title: 'Deterministic Risk Scoring v2.1', desc: 'Explainable 8-dimension pre-release risk index with confidence & completeness bounds.' },
  { icon: Network, title: 'Digital Twin & Blast Radius', desc: 'Simulate downstream service, API contract, and datastore ripple effects before deploying.' },
  { icon: Database, title: 'SQL Migration Lock Intel', desc: 'Catch DROP TABLE, table-rewriting ALTERs, and missing CONCURRENTLY with Expand-Contract plans.' },
  { icon: PackageCheck, title: 'SBOM, CVE & SLSA Gate', desc: 'CycloneDX 1.5 & SPDX 2.3 verification, CVE correlation, and cryptographic Readiness Passports.' },
  { icon: Zap, title: 'Canary Statistical Gate', desc: 'Welch t-test & z-score anomaly detection comparing baseline vs canary with human-safe rollback.' },
  { icon: Activity, title: 'Release Replay & Postmortem', desc: 'Synchronized commit-to-incident timeline separating observed telemetry from causal hypotheses.' },
  { icon: Sparkles, title: 'Policy Simulation Mode', desc: 'Dry-run governance rules against historical releases before turning enforcement on.' },
  { icon: FileCheck2, title: 'Compliance & Ethical DORA', desc: 'SOC 2, ISO 27001, NIST CSF, OWASP ASVS, SLSA evidence exports with zero individual dev ranking.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40">
              <Shield className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">ReleaseGuard</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#capabilities" className="hover:text-white">Capabilities</a>
            <Link href="/pricing" className="hover:text-white">Pricing</Link>
            <Link href="/api/v1/docs" target="_blank" className="hover:text-white">OpenAPI</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="rg-btn-secondary">Sign In</Link>
            <Link href="/register" className="rg-btn-primary">
              Start Free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-6 py-20 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1 text-xs font-medium text-blue-300">
            <Lock className="h-3.5 w-3.5" /> Deterministic Control Plane · Zero Black-Box AI Approvals
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Know the risk before you release. <span className="text-blue-400">Protect every deployment.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-slate-300 sm:text-lg">
            ReleaseGuard unifies pre-release risk scoring, Deployment Digital Twins, SQL migration safety, CycloneDX SBOMs, Policy Simulation, statistical canary gates, and incident replay in one multi-tenant SaaS platform.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/login" className="rg-btn-primary px-6 py-3 text-base">
              Launch Live Console <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className="rg-btn-secondary px-6 py-3 text-base">
              Compare SaaS Plans
            </Link>
          </div>

          <div className="mt-14 grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-left sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-400">Core Modules</div>
              <div className="mt-1 text-2xl font-bold text-white">16 Modules</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Differentiators</div>
              <div className="mt-1 text-2xl font-bold text-blue-400">10 Engines</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">RBAC Granularity</div>
              <div className="mt-1 text-2xl font-bold text-emerald-400">9 Roles + RLS</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Safety Default</div>
              <div className="mt-1 text-2xl font-bold text-amber-300">Human-in-Loop</div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="mx-auto max-w-7xl px-6 pb-24">
          <h2 className="mb-8 text-center text-2xl font-bold text-white">End-to-End SDLC &amp; SRE Control Plane</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.title} className="rg-card transition hover:border-blue-500/40">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">{c.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{c.desc}</p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        <div className="flex items-center justify-center gap-2">
          <GitBranch className="h-3.5 w-3.5" /> ReleaseGuard Enterprise Control Plane · Powered by Deterministic Engines &amp; Supabase PostgreSQL 17
        </div>
      </footer>
    </div>
  );
}
