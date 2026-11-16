-- ReleaseGuard Enterprise Schema (Isolated in schema `releaseguard`)
-- PostgreSQL 17+ / Supabase Compatible with Row-Level Security (RLS)

CREATE SCHEMA IF NOT EXISTS releaseguard;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Expose releaseguard schema to Supabase PostgREST
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, releaseguard';
GRANT USAGE ON SCHEMA releaseguard TO anon, authenticated, service_role;

-- Tenant context helper for RLS
CREATE OR REPLACE FUNCTION releaseguard.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid;
$$;

-- 1. Organizations
CREATE TABLE IF NOT EXISTS releaseguard.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE')),
  billing_status text NOT NULL DEFAULT 'ACTIVE' CHECK (billing_status IN ('ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELED')),
  stripe_customer_id text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Users
CREATE TABLE IF NOT EXISTS releaseguard.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_enc text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INVITED')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Memberships (9 RBAC Roles)
CREATE TABLE IF NOT EXISTS releaseguard.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES releaseguard.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN (
    'ORG_OWNER', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'RELEASE_MANAGER',
    'SRE_ONCALL', 'DEV_LEAD', 'DEVELOPER', 'AUDITOR', 'VIEWER'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- 4. API Keys
CREATE TABLE IF NOT EXISTS releaseguard.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES releaseguard.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '["releases:read","releases:write"]'::jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Projects
CREATE TABLE IF NOT EXISTS releaseguard.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  repo_url text NOT NULL DEFAULT '',
  default_branch text NOT NULL DEFAULT 'main',
  service_tier text NOT NULL DEFAULT 'TIER_1' CHECK (service_tier IN ('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3')),
  auto_rollback_enabled boolean NOT NULL DEFAULT false,
  dependency_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

-- 6. Environments
CREATE TABLE IF NOT EXISTS releaseguard.environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES releaseguard.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('dev', 'staging', 'prod')),
  risk_threshold int NOT NULL DEFAULT 70 CHECK (risk_threshold BETWEEN 0 AND 100),
  require_approval boolean NOT NULL DEFAULT true,
  auto_rollback_enabled boolean NOT NULL DEFAULT false,
  freeze_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

-- 7. Releases
CREATE TABLE IF NOT EXISTS releaseguard.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES releaseguard.projects(id) ON DELETE CASCADE,
  environment_id uuid REFERENCES releaseguard.environments(id) ON DELETE SET NULL,
  version text NOT NULL,
  git_sha text NOT NULL,
  branch text NOT NULL DEFAULT 'main',
  pr_number int,
  author_id uuid REFERENCES releaseguard.users(id) ON DELETE SET NULL,
  author_email text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ANALYZED' CHECK (status IN (
    'DRAFT', 'ANALYZED', 'AWAITING_APPROVAL', 'APPROVED', 'BLOCKED', 'DEPLOYING', 'DEPLOYED', 'ROLLED_BACK', 'FAILED'
  )),
  risk_score numeric(5,2) NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  confidence numeric(4,3) NOT NULL DEFAULT 0.85,
  completeness numeric(4,3) NOT NULL DEFAULT 1.0,
  scoring_version text NOT NULL DEFAULT 'v2.1.0',
  factor_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  digital_twin jsonb NOT NULL DEFAULT '{}'::jsonb,
  blast_radius jsonb NOT NULL DEFAULT '{}'::jsonb,
  passport_signature text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

-- 8. SQL Migration Analyses
CREATE TABLE IF NOT EXISTS releaseguard.sql_migration_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES releaseguard.releases(id) ON DELETE CASCADE,
  filename text NOT NULL,
  raw_sql text NOT NULL,
  lock_risk text NOT NULL CHECK (lock_risk IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  destructive_ops jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  expand_contract_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  rollback_sql text NOT NULL DEFAULT '',
  requires_manual_approval boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES releaseguard.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. SBOM Artifacts
CREATE TABLE IF NOT EXISTS releaseguard.sbom_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES releaseguard.releases(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('cyclonedx', 'spdx')),
  spec_version text NOT NULL,
  components_count int NOT NULL DEFAULT 0,
  vulnerabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  license_violations jsonb NOT NULL DEFAULT '[]'::jsonb,
  slsa_level int NOT NULL DEFAULT 1,
  signature_verified boolean NOT NULL DEFAULT false,
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Intelligent Test Selections
CREATE TABLE IF NOT EXISTS releaseguard.test_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES releaseguard.releases(id) ON DELETE CASCADE,
  strategy_version text NOT NULL DEFAULT 'its-v1.4',
  total_tests int NOT NULL DEFAULT 0,
  selected_tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  skipped_tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  mandatory_security_tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_savings_pct numeric(5,2) NOT NULL DEFAULT 0,
  predicted_catch_prob numeric(4,3) NOT NULL DEFAULT 0.95,
  actual_outcome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. Policies
CREATE TABLE IF NOT EXISTS releaseguard.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('RISK', 'SECURITY', 'DATABASE', 'GOVERNANCE', 'FINOPS', 'COMPLIANCE')),
  rule_dsl jsonb NOT NULL,
  mode text NOT NULL DEFAULT 'enforce' CHECK (mode IN ('enforce', 'simulate')),
  severity text NOT NULL DEFAULT 'BLOCK' CHECK (severity IN ('WARN', 'BLOCK')),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES releaseguard.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Policy Evaluations
CREATE TABLE IF NOT EXISTS releaseguard.policy_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES releaseguard.releases(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES releaseguard.policies(id) ON DELETE SET NULL,
  policy_name text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('enforce', 'simulate')),
  verdict text NOT NULL CHECK (verdict IN ('PASS', 'WARN', 'BLOCK')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  simulated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 13. Approvals (Separation of Duties)
CREATE TABLE IF NOT EXISTS releaseguard.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES releaseguard.releases(id) ON DELETE CASCADE,
  environment_id uuid REFERENCES releaseguard.environments(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES releaseguard.users(id) ON DELETE SET NULL,
  approver_id uuid REFERENCES releaseguard.users(id) ON DELETE SET NULL,
  decision text NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING', 'APPROVED', 'REJECTED', 'WAIVED')),
  rationale text NOT NULL DEFAULT '',
  sod_verified boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 14. Deployments
CREATE TABLE IF NOT EXISTS releaseguard.deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES releaseguard.releases(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES releaseguard.projects(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES releaseguard.environments(id) ON DELETE CASCADE,
  strategy text NOT NULL DEFAULT 'canary' CHECK (strategy IN ('rolling', 'canary', 'blue_green')),
  adapter text NOT NULL DEFAULT 'github' CHECK (adapter IN ('github', 'gitlab', 'jenkins', 'circleci', 'argocd', 'k8s', 'docker', 'vercel')),
  external_id text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CANARY_ACTIVE', 'HEALTHY', 'DEGRADED', 'PROMOTED', 'ROLLED_BACK', 'FAILED')),
  traffic_pct int NOT NULL DEFAULT 10 CHECK (traffic_pct BETWEEN 0 AND 100),
  baseline_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  canary_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_verdict text NOT NULL DEFAULT 'UNKNOWN' CHECK (health_verdict IN ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'CRITICAL')),
  rollback_recommended boolean NOT NULL DEFAULT false,
  auto_rollback_executed boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 15. Telemetry Snapshots
CREATE TABLE IF NOT EXISTS releaseguard.telemetry_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  deployment_id uuid NOT NULL REFERENCES releaseguard.deployments(id) ON DELETE CASCADE,
  window_type text NOT NULL CHECK (window_type IN ('baseline', 'canary', 'post_release')),
  error_rate numeric(6,4) NOT NULL DEFAULT 0,
  p95_latency_ms numeric(10,2) NOT NULL DEFAULT 0,
  rps numeric(10,2) NOT NULL DEFAULT 0,
  cpu_pct numeric(5,2) NOT NULL DEFAULT 0,
  mem_pct numeric(5,2) NOT NULL DEFAULT 0,
  restart_count int NOT NULL DEFAULT 0,
  anomaly_score numeric(6,3) NOT NULL DEFAULT 0,
  anomaly_detected boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- 16. Incidents
CREATE TABLE IF NOT EXISTS releaseguard.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES releaseguard.projects(id) ON DELETE CASCADE,
  release_id uuid REFERENCES releaseguard.releases(id) ON DELETE SET NULL,
  deployment_id uuid REFERENCES releaseguard.deployments(id) ON DELETE SET NULL,
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('SEV1', 'SEV2', 'SEV3', 'SEV4')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED')),
  observed_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  causal_hypotheses jsonb NOT NULL DEFAULT '[]'::jsonb,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  postmortem_md text NOT NULL DEFAULT '',
  external_issue_ref text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- 17. Remediation Actions (L0-L4)
CREATE TABLE IF NOT EXISTS releaseguard.remediation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  incident_id uuid REFERENCES releaseguard.incidents(id) ON DELETE CASCADE,
  release_id uuid REFERENCES releaseguard.releases(id) ON DELETE SET NULL,
  autonomy_level text NOT NULL CHECK (autonomy_level IN ('L0', 'L1', 'L2', 'L3', 'L4')),
  action_type text NOT NULL,
  title text NOT NULL,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  reversibility text NOT NULL DEFAULT 'REVERSIBLE' CHECK (reversibility IN ('REVERSIBLE', 'PARTIALLY_REVERSIBLE', 'NON_REVERSIBLE')),
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'APPROVED', 'EXECUTED', 'REJECTED', 'ROLLED_BACK')),
  approved_by uuid REFERENCES releaseguard.users(id) ON DELETE SET NULL,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 18. Infrastructure Drift Intelligence
CREATE TABLE IF NOT EXISTS releaseguard.infra_drifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES releaseguard.projects(id) ON DELETE CASCADE,
  environment_id uuid REFERENCES releaseguard.environments(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('terraform', 'kubernetes')),
  resource_address text NOT NULL,
  drift_type text NOT NULL CHECK (drift_type IN ('MODIFIED', 'UNMANAGED', 'DELETED', 'PUBLIC_EXPOSURE', 'IAM_ESCALATION')),
  severity text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  public_exposure boolean NOT NULL DEFAULT false,
  desired_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  live_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  patch_pr_diff text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DETECTED' CHECK (status IN ('DETECTED', 'PR_OPENED', 'RESOLVED', 'ACCEPTED')),
  detected_at timestamptz NOT NULL DEFAULT now()
);

-- 19. FinOps Cost Delta Estimates
CREATE TABLE IF NOT EXISTS releaseguard.finops_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES releaseguard.projects(id) ON DELETE CASCADE,
  release_id uuid REFERENCES releaseguard.releases(id) ON DELETE SET NULL,
  deployment_id uuid REFERENCES releaseguard.deployments(id) ON DELETE SET NULL,
  monthly_delta_usd numeric(10,2) NOT NULL DEFAULT 0,
  cost_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_note text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('MANIFEST_ESTIMATE', 'CLOUD_BILLING_CONNECTOR')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 20. DORA Metrics Daily (Team/Project level ONLY — zero individual developer ranking)
CREATE TABLE IF NOT EXISTS releaseguard.dora_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES releaseguard.projects(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  deploy_count int NOT NULL DEFAULT 0,
  lead_time_hours numeric(8,2) NOT NULL DEFAULT 0,
  change_failure_rate numeric(5,4) NOT NULL DEFAULT 0,
  mttr_hours numeric(8,2) NOT NULL DEFAULT 0,
  bottleneck_stage text NOT NULL DEFAULT 'review',
  UNIQUE (project_id, metric_date)
);

-- 21. Compliance Controls
CREATE TABLE IF NOT EXISTS releaseguard.compliance_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  framework text NOT NULL CHECK (framework IN ('SOC2', 'ISO27001', 'NIST_CSF', 'OWASP_ASVS', 'SLSA', 'GDPR')),
  control_id text NOT NULL,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('COMPLIANT', 'PARTIAL', 'NON_COMPLIANT')),
  evidence_count int NOT NULL DEFAULT 0,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, framework, control_id)
);

-- 22. Reliability Learning Outcomes
CREATE TABLE IF NOT EXISTS releaseguard.reliability_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES releaseguard.releases(id) ON DELETE CASCADE,
  predicted_risk_score numeric(5,2) NOT NULL,
  predicted_incident_prob numeric(4,3) NOT NULL,
  actual_incident_occurred boolean NOT NULL DEFAULT false,
  feedback_delta numeric(6,3) NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- 23. Chaos Engineering Readiness
CREATE TABLE IF NOT EXISTS releaseguard.chaos_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES releaseguard.projects(id) ON DELETE CASCADE,
  environment_id uuid REFERENCES releaseguard.environments(id) ON DELETE SET NULL,
  readiness_score int NOT NULL CHECK (readiness_score BETWEEN 0 AND 100),
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_experiments jsonb NOT NULL DEFAULT '[]'::jsonb,
  prod_blocked boolean NOT NULL DEFAULT true,
  assessed_at timestamptz NOT NULL DEFAULT now()
);

-- 24. Integrations / Connectors
CREATE TABLE IF NOT EXISTS releaseguard.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'DEGRADED', 'DISCONNECTED', 'SIMULATOR')),
  config_public jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_enc text,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, display_name)
);

-- 25. Usage Metering
CREATE TABLE IF NOT EXISTS releaseguard.usage_metering (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  period_ym text NOT NULL,
  releases_count int NOT NULL DEFAULT 0,
  deployments_count int NOT NULL DEFAULT 0,
  sbom_scans_count int NOT NULL DEFAULT 0,
  ai_tokens_used int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_ym)
);

-- 26. Durable Jobs Queue (fallback when REDIS_URL is absent)
CREATE TABLE IF NOT EXISTS releaseguard.jobs_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 27. Immutable Hash-Chained Audit Logs
CREATE TABLE IF NOT EXISTS releaseguard.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES releaseguard.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES releaseguard.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash text NOT NULL,
  entry_hash text NOT NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_releases_org_created ON releaseguard.releases(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_releases_project ON releaseguard.releases(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_org_started ON releaseguard.deployments(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_org_detected ON releaseguard.incidents(organization_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON releaseguard.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_dep ON releaseguard.telemetry_snapshots(deployment_id, recorded_at DESC);

-- Enable RLS across all tenant-scoped tables
DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'memberships', 'api_keys', 'projects', 'environments', 'releases',
    'sql_migration_analyses', 'sbom_artifacts', 'test_selections', 'policies',
    'policy_evaluations', 'approvals', 'deployments', 'telemetry_snapshots',
    'incidents', 'remediation_actions', 'infra_drifts', 'finops_estimates',
    'dora_metrics_daily', 'compliance_controls', 'reliability_outcomes',
    'chaos_readiness', 'integrations', 'usage_metering', 'jobs_queue', 'audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE releaseguard.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS rg_tenant_isolation ON releaseguard.%I;', tbl);
    EXECUTE format(
      'CREATE POLICY rg_tenant_isolation ON releaseguard.%I
       USING (
         auth.role() = ''service_role''
         OR organization_id = releaseguard.current_org_id()
       )
       WITH CHECK (
         auth.role() = ''service_role''
         OR organization_id = releaseguard.current_org_id()
       );',
      tbl
    );
  END LOOP;
END $$;

ALTER TABLE releaseguard.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rg_org_isolation ON releaseguard.organizations;
CREATE POLICY rg_org_isolation ON releaseguard.organizations
  USING (auth.role() = 'service_role' OR id = releaseguard.current_org_id())
  WITH CHECK (auth.role() = 'service_role' OR id = releaseguard.current_org_id());

GRANT ALL ON ALL TABLES IN SCHEMA releaseguard TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA releaseguard TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA releaseguard TO service_role, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA releaseguard GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA releaseguard GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

NOTIFY pgrst, 'reload config';
