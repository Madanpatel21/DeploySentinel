# ReleaseGuard — REST API v1 & OpenAPI Specification

- **Base Path:** `/api/v1`
- **Interactive Swagger UI:** `/api/v1/docs`
- **OpenAPI 3.x JSON:** `/api/v1/docs/json`
- **Health & Readiness:** `GET /healthz`, `GET /readyz`, `GET /metrics`
- **Real-Time Events:** `GET /api/v1/stream` (Server-Sent Events scoped by `organizationId`)

## Endpoint Inventory

### Authentication, RBAC & Keys
- `POST /api/v1/auth/register` — Provision new organization + `ORG_OWNER`
- `POST /api/v1/auth/login` — Email/password + optional TOTP MFA login
- `GET /api/v1/auth/me` — Active user, organization, and SaaS plan entitlements
- `POST /api/v1/auth/mfa/setup` & `/auth/mfa/enable` — RFC 6238 TOTP MFA enrollment
- `GET|POST|DELETE /api/v1/auth/api-keys` — Manage `rg_live_` CI/CD API keys
- `GET|PATCH /api/v1/org/members` — 9-role RBAC directory and role assignments

### Projects, Releases & Verification Engines
- `GET|POST /api/v1/projects` — Service projects & environments (`auto_rollback_enabled=false`)
- `POST /api/v1/projects/scan-local-repo` — Real local `git` CLI repository scanner
- `GET /api/v1/releases` & `GET /api/v1/releases/:id` — Release list and full breakdown
- `POST /api/v1/releases/ingest` — Idempotent ingestion running Risk, Blast Radius, SQL, SBOM, ITS, Policy, Digital Twin, and Passport signing
- `POST /api/v1/webhooks/github` — HMAC-SHA256 verified webhook ingestion
- `POST /api/v1/releases/:id/approve` — Separation-of-Duties release gate
- `POST /api/v1/releases/:id/explain` — Prompt-injection-hardened AI risk explanation
- `GET /api/v1/releases/:id/replay` — Synchronized commit-to-remediation timeline
- `GET|POST /api/v1/sql-migrations` & `/analyze` & `/:id/approve`
- `GET|POST /api/v1/sboms` & `/analyze`
- `GET /api/v1/test-selections`

### Governance, Delivery, Incidents & Ops
- `GET|POST /api/v1/policies` & `POST /api/v1/policies/simulate`
- `GET|POST /api/v1/deployments` & `/:id/telemetry` & `/:id/promote` & `/:id/rollback`
- `GET|POST /api/v1/incidents` & `/:id/resolve`
- `GET|POST /api/v1/remediations` & `/:id/approve` & `/:id/execute`
- `GET|POST /api/v1/drifts` & `/analyze` & `/:id/open-pr`
- `GET|POST /api/v1/finops` & `/estimate`
- `GET /api/v1/dora`
- `GET /api/v1/compliance` & `/export`
- `GET /api/v1/learning/calibration`
- `GET|POST /api/v1/chaos` & `/assess`
- `GET /api/v1/cross-project`
- `GET|POST /api/v1/integrations` & `/:id/test`
- `GET|POST /api/v1/billing` & `/upgrade`
- `GET /api/v1/audit-logs` & `/verify`
