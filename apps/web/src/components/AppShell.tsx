'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Box,
  CheckCircle2,
  Cpu,
  Database,
  DollarSign,
  FileCheck2,
  FolderGit2,
  GitBranch,
  History,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Menu,
  Network,
  PackageCheck,
  Plug,
  Rocket,
  Scale,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from './Providers';

const NAV_GROUPS = [
  {
    title: 'Control Plane',
    items: [
      { href: '/dashboard', label: 'Executive Overview', icon: Activity },
      { href: '/projects', label: 'Projects & Git Scan', icon: FolderGit2 },
      { href: '/releases', label: 'Release Intelligence', icon: Rocket },
      { href: '/digital-twin', label: 'Deployment Digital Twin', icon: Cpu },
      { href: '/blast-radius', label: 'Blast-Radius Simulator', icon: Network },
    ],
  },
  {
    title: 'Verification & Safety',
    items: [
      { href: '/sql-migrations', label: 'SQL Migration Intel', icon: Database },
      { href: '/supply-chain', label: 'SBOM & Supply Chain', icon: PackageCheck },
      { href: '/test-selection', label: 'Intelligent Test Select', icon: CheckCircle2 },
      { href: '/governance', label: 'Policy Governance', icon: Scale },
      { href: '/policy-simulation', label: 'Policy Simulation Mode', icon: Sparkles },
    ],
  },
  {
    title: 'Delivery & SRE',
    items: [
      { href: '/deployments', label: 'Deployment Control', icon: Layers },
      { href: '/canary', label: 'Canary Intelligence', icon: Zap },
      { href: '/health', label: 'Post-Deploy Health', icon: Activity },
      { href: '/incidents', label: 'Incident Investigation', icon: AlertTriangle },
      { href: '/replay', label: 'Release Replay Engine', icon: History },
      { href: '/remediation', label: 'Remediation (L0-L4)', icon: Bot },
    ],
  },
  {
    title: 'Platform & FinOps',
    items: [
      { href: '/drift', label: 'Infra Drift Intel', icon: GitBranch },
      { href: '/finops', label: 'Cloud FinOps Deltas', icon: DollarSign },
      { href: '/dora', label: 'Ethical DORA Metrics', icon: BarChart3 },
      { href: '/learning', label: 'Reliability Learning', icon: ShieldAlert },
      { href: '/chaos', label: 'Chaos Readiness', icon: Terminal },
      { href: '/cross-project', label: 'Cross-Project Intel', icon: Box },
    ],
  },
  {
    title: 'Compliance & Admin',
    items: [
      { href: '/compliance', label: 'Compliance & Audit', icon: FileCheck2 },
      { href: '/integrations', label: 'Integrations Hub', icon: Plug },
      { href: '/settings', label: 'Org, RBAC, Keys & API', icon: Settings },
    ],
  },
];

export function AppShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);

  useEffect(() => {
    if (!loading && !token) {
      router.push('/login');
    }
  }, [loading, token, router]);

  useEffect(() => {
    if (!token) return;
    const es = new EventSource(`/api/v1/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('connected', () => setSseConnected(true));
    es.onerror = () => setSseConnected(false);
    return () => es.close();
  }, [token]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090d16] text-slate-300">
        <div className="flex items-center gap-3 text-sm">
          <Shield className="h-5 w-5 animate-pulse text-blue-500" />
          <span>Verifying DeploySentinel control plane session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#090d16] text-slate-100">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform overflow-y-auto border-r border-slate-800 bg-slate-950/95 p-4 transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white">DeploySentinel</div>
              <div className="text-[10px] font-medium text-slate-400">{user.organizationName}</div>
            </div>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="text-slate-400 lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'bg-blue-600/20 text-blue-300 ring-1 ring-blue-500/30'
                          : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-6 border-t border-slate-800 pt-4 text-xs">
          <div className="mb-2 flex items-center justify-between text-slate-400">
            <span className="truncate font-medium text-slate-200">{user.full_name}</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">{user.role}</span>
          </div>
          <div className="mb-3 flex items-center gap-2 text-[11px] text-slate-400">
            <span className={`h-2 w-2 rounded-full ${sseConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span>{sseConnected ? 'Live SSE Telemetry' : 'Connecting SSE...'}</span>
          </div>
          <div className="flex gap-2">
            <Link href="/pricing" className="rg-btn-secondary flex-1 py-1.5 text-xs">
              <KeyRound className="h-3 w-3" /> {user.plan}
            </Link>
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="rg-btn-secondary py-1.5 text-xs text-rose-300 hover:text-rose-200"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-[#090d16]/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg border border-slate-800 p-1.5 text-slate-300 lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-white md:text-lg">{title}</h1>
              {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300 sm:inline-flex">
              <Lock className="h-3 w-3" /> Auto-Rollback: OFF
            </span>
            <Link href="/api/v1/docs" target="_blank" className="rg-btn-secondary py-1 text-xs">
              OpenAPI Docs
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
