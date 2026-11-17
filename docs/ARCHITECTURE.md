# DeploySentinel — System Architecture

**Version:** 1.0.0  
**Last Updated:** 2026-11-16  

---

## 1. Architectural Overview

DeploySentinel is architected as a modular TypeScript monorepo separating pure deterministic domain engines (`packages/engine`), shared contracts (`packages/shared`), API & orchestration control plane (`apps/api`), and the 30-screen enterprise web console (`apps/web`).

```mermaid
flowchart TB
    subgraph Clients["Clients & External Ecosystems"]
        WEB["Next.js 30-Screen Console<br/>(apps/web)"]
        CLI["CI/CD & GitHub/GitLab/Argo<br/>Webhooks (HMAC-SHA256)"]
        OTEL["OTel / Prometheus /<br/>Alert Telemetry"]
    end

    subgraph ControlPlane["DeploySentinel API & Control Plane (apps/api)"]
        AUTH["Auth, JWT, MFA, 9-Role RBAC<br/>& Tenant Isolation"]
        REST["Fastify REST v1 + OpenAPI + SSE"]
        QUEUE["Job Queue & Async Worker<br/>(BullMQ/Redis or PG Queue)"]
        ADAPTERS["Connector Adapters<br/>(Git, Supabase, Linear, Notion, Vercel, Slack)"]
    end

    subgraph Engines["Deterministic Core Engines (packages/engine)"]
        RISK["Release Risk Scorer v2.1"]
        TWIN["Digital Twin & Blast Radius"]
        SQL["SQL Migration Analyzer"]
        SBOM["SBOM / SLSA / CVE Engine"]
        ITS["Intelligent Test Selector"]
        POLICY["Policy-as-Code & Simulator"]
        CANARY["Canary Statistical & Health Engine"]
        REPLAY["Replay, Incident & Learning Engine"]
        REMED["Remediation L0-L4 & Drift/FinOps/DORA"]
        AI["Provider-Independent AI Explainer<br/>(Deterministic Local Fallback)"]
    end

    subgraph Data["Persistence & Audit (Supabase PostgreSQL 17)"]
        PG[("Schema: releaseguard<br/>Multi-Tenant Tables + RLS")]
        AUDIT[("Hash-Chained Immutable<br/>Audit Log")]
    end

    WEB --> AUTH --> REST
    CLI --> REST
    OTEL --> REST
    REST --> QUEUE
    REST --> Engines
    QUEUE --> Engines
    REST --> ADAPTERS
    Engines --> PG
    REST --> PG
    REST --> AUDIT
```

---

## 2. Deployment & Request Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant CI as CI/CD / Git Repo
    participant API as DeploySentinel API
    participant ENG as Deterministic Engines
    participant POL as Policy & Approval Gate
    participant CAN as Canary / Health Monitor
    participant DB as Supabase PG (releaseguard)

    CI->>API: POST /api/v1/releases/ingest (HMAC verified + Idempotency-Key)
    API->>ENG: Analyze diff, SQL migrations, SBOM, Blast Radius, Test Selection
    ENG-->>API: Versioned Risk Score + Readiness Passport + Factor Breakdown
    API->>POL: Evaluate Governance Rules (SoD, Risk Threshold, Freeze Window)
    POL-->>DB: Persist Release, Evaluation, Hash-Chained Audit Event
    alt Requires Manual Approval (HIGH/CRITICAL or Prod)
        POL-->>API: Status = AWAITING_APPROVAL
    else Policy Passed
        POL-->>API: Status = READY_TO_DEPLOY
    end
    CI->>API: POST /api/v1/deployments/:id/telemetry (Canary & Baseline windows)
    API->>CAN: Welch t-test / z-score statistical anomaly detection
    CAN-->>API: Health Verdict + Rollback Recommendation (auto_rollback=false)
```

---

## 3. Multi-Tenant & Database Isolation

- **Database:** Supabase PostgreSQL 17.11 (`frxweuvcxauwntotmctw`), isolated in dedicated schema `releaseguard` (zero collision with `public` schema tables).
- **Row-Level Security (RLS):** Every tenant-owned table enforces `organization_id` scoping via PostgreSQL RLS policies (`releaseguard.current_org_id()`) and API-layer `TenantContext` middleware.
- **Immutable Audit Chain:** Every sensitive mutation computes `entry_hash = SHA256(prev_hash || org_id || actor_id || action || resource_id || canonical_payload || created_at)` enabling cryptographic tamper detection.

---

## 4. Resilience & Graceful Degradation

- **Queueing:** Uses Redis/BullMQ when `REDIS_URL` is configured; automatically falls back to PostgreSQL-backed durable job execution in single-node or sandboxed environments.
- **AI Adapter:** Defaults to deterministic template/evidence synthesis (`AI_PROVIDER=local`) with optional OpenAI/Anthropic/Ollama adapters guarded by prompt-injection sanitization, schema validation, and circuit breakers.
