# ReleaseGuard

**Know the risk before you release. Understand every change. Protect every deployment.**

ReleaseGuard is an enterprise-grade, AI-assisted **DevOps Intelligence, Release Engineering, Deployment Risk Management, and Site Reliability Control Plane**.

## Key Capabilities
- **16 Core Product Modules**: Multi-Tenant RBAC (9 roles), Deterministic Risk Engine (`v2.1.0`), Change Impact Analysis, Intelligent Test Selection, Supply Chain Security (CycloneDX 1.5 / SPDX 2.3 / SLSA), SQL Migration Lock Intelligence, Deployment Control Center, Canary Statistical Gate, Post-Deployment Health Telemetry, Incident Investigation, Controlled Remediation (L0–L4), Release Governance, Infrastructure Drift Intelligence, Cloud FinOps Deltas, Ethical DORA Metrics (zero individual developer ranking), and Compliance & Audit Center.
- **10 Differentiators**: Deployment Digital Twin, Release Blast-Radius Simulator, Release Replay Engine, Reliability Learning Engine, Cryptographically Signed Deployment Readiness Passport, Autonomous Incident Investigation, Predictive Reliability Calibration, Chaos Engineering Readiness (non-prod only), Policy Simulation Mode, and Cross-Project Reliability Intelligence.
- **30-Screen Next.js Enterprise Console** backed by a Fastify TypeScript REST v1 + OpenAPI + SSE API and Supabase PostgreSQL 17 (`releaseguard` schema with Row-Level Security).

## Quickstart
```bash
cp .env.example .env
npm install
npm run build
npm run seed
npm run dev:api   # http://0.0.0.0:4000
npm run dev:web   # http://0.0.0.0:3000
```

## Seeded Demo Credentials
All seeded accounts use password `ReleaseGuard!2026`:
- `owner@acme.releaseguard.io` (`ORG_OWNER` — Acme Cloud Corp)
- `relmgr@acme.releaseguard.io` (`RELEASE_MANAGER` — Acme Cloud Corp)
- `sre@acme.releaseguard.io` (`SRE_ONCALL` — Acme Cloud Corp)
- `sec@acme.releaseguard.io` (`SECURITY_ADMIN` — Acme Cloud Corp)
- `dev@acme.releaseguard.io` (`DEVELOPER` — Acme Cloud Corp)
- `auditor@acme.releaseguard.io` (`AUDITOR` — Acme Cloud Corp)
- `beta-owner@beta.releaseguard.io` (`ORG_OWNER` — Beta Fintech Labs, isolated tenant)
