# DeploySentinel — Database Schema & Row-Level Security

DeploySentinel uses a dedicated PostgreSQL 17 schema **`releaseguard`** on Supabase (`frxweuvcxauwntotmctw`), completely isolated from `public` tables, with Row-Level Security (RLS) enabled on all 26 tenant-owned tables plus `organizations`.

```mermaid
erDiagram
    organizations ||--o{ memberships : has
    users ||--o{ memberships : joins
    organizations ||--o{ projects : owns
    projects ||--o{ environments : contains
    projects ||--o{ releases : tracks
    releases ||--o{ sql_migration_analyses : analyzes
    releases ||--o{ sbom_artifacts : produces
    releases ||--o{ test_selections : selects
    releases ||--o{ policy_evaluations : evaluates
    releases ||--o{ approvals : gates
    releases ||--o{ deployments : deploys
    deployments ||--o{ telemetry_snapshots : records
    deployments ||--o{ incidents : correlates
    incidents ||--o{ remediation_actions : proposes
    organizations ||--o{ audit_logs : chains
```

## Key Safety Constraints in DDL
- `projects.auto_rollback_enabled` defaults to `false`.
- `environments.auto_rollback_enabled` defaults to `false`.
- `releases.idempotency_key` has a unique constraint per `organization_id`.
- `audit_logs` stores `prev_hash` and `entry_hash` (`SHA-256`) for cryptographic tamper detection.
- `dora_metrics_daily` stores metrics strictly by `project_id` and `metric_date` — there is no `user_id` or individual developer ranking column anywhere in DORA storage.
