# DeploySentinel — 20-Phase Implementation Roadmap

| Phase | Scope | Key Deliverables | Target Milestone |
| :--- | :--- | :--- | :--- |
| **0** | Workspace, Connectors & Baseline | Connector inventory, Linear/Notion/Supabase setup, Disk/Runtime check | M1 |
| **1** | Product, Competitive & Security Spec | PRD, Competitive Analysis, Positioning, Architecture, Threat Model | M1 |
| **2** | Monorepo & Infrastructure Scaffold | npm workspaces, TS configs, Dockerfiles, Compose, Env templates | M1 |
| **3** | Database Schema, RLS & Seed | Supabase `releaseguard` schema, migrations, RLS, idempotent seed | M1 |
| **4** | Auth, RBAC (9 Roles) & Multi-Tenancy | JWT/bcrypt/MFA, API keys, tenant scoping, hash-chained audit logs | M1 |
| **5** | Core Deterministic Engines (Part 1) | Risk Scorer v2.1, Change Impact & Digital Twin, Blast Radius, ITS | M2 |
| **6** | Supply Chain & SQL Migration Engines | CycloneDX/SPDX SBOM, CVE/SLSA, SQL DDL Lock/Expand-Contract | M2 |
| **7** | Governance, Policy Sim & Passport | Policy-as-Code evaluator, Dry-run simulator, Signed Release Passport | M2 |
| **8** | Deployment, Canary & Health Telemetry | CI/CD adapters, Welch t-test Canary Gate, OTel anomaly detection | M2 |
| **9** | Incident, Replay, Learning & Remediation | Replay Engine, Root Cause Investigator, L0–L4 Remediation | M2 |
| **10** | Drift, FinOps, DORA & Compliance | Terraform/K8s drift, Cost delta, Ethical DORA, SOC2/ISO/NIST/SLSA | M2 |
| **11** | AI Adapter & Prompt-Injection Defense | Provider-independent explainer + deterministic fallback | M2 |
| **12** | Commercial SaaS, Billing & OpenAPI | Plans, entitlements, metering, sandbox billing, Swagger/OpenAPI + SSE | M2 |
| **13** | Web Console Core & Screens 1–10 | Auth, Marketing, Pricing, Overview, Releases, Detail, Twin, Blast Radius | M3 |
| **14** | Web Console Engines & Screens 11–20 | SQL, SBOM, Tests, Governance, Policy Sim, Deploy, Canary, Incidents, Replay, Remediation | M3 |
| **15** | Web Console Ops & Screens 21–30 | Drift, FinOps, DORA, Compliance, Learning, Integrations, Org, Billing, API Docs | M3 |
| **16** | Real Git Repo Inspector & Connectors | Live local git repo scanning + Linear/Notion/Supabase/Vercel/Slack adapters | M3 |
| **17** | Observability, Terraform, K8s & CI/CD | Prometheus, Grafana, OTel, Loki, Jaeger, Terraform, K8s, GitHub Actions | M3 |
| **18** | Comprehensive Automated Test Suite | Unit, Integration, API, RBAC/Tenant Security, E2E Playwright, Perf | M3 |
| **19** | Full Documentation Suite (19+ Docs) | All required docs with Mermaid diagrams + Connector Report | M3 |
| **20** | Final Hardening & Production Sign-Off | Live runtime verification, zero-defect pass, Production Readiness Report | M3 |
