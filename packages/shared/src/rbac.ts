export const RBAC_ROLES = [
  'ORG_OWNER',
  'PLATFORM_ADMIN',
  'SECURITY_ADMIN',
  'RELEASE_MANAGER',
  'SRE_ONCALL',
  'DEV_LEAD',
  'DEVELOPER',
  'AUDITOR',
  'VIEWER',
] as const;

export type RbacRole = (typeof RBAC_ROLES)[number];

export type Permission =
  | 'org:manage'
  | 'billing:manage'
  | 'users:manage'
  | 'api_keys:manage'
  | 'projects:write'
  | 'projects:read'
  | 'releases:ingest'
  | 'releases:read'
  | 'releases:approve_prod'
  | 'releases:approve_nonprod'
  | 'migrations:approve'
  | 'policies:write'
  | 'policies:read'
  | 'policies:simulate'
  | 'deployments:trigger'
  | 'deployments:promote'
  | 'deployments:rollback'
  | 'incidents:write'
  | 'incidents:read'
  | 'remediation:propose'
  | 'remediation:approve'
  | 'remediation:execute'
  | 'sbom:write'
  | 'sbom:read'
  | 'drift:read'
  | 'drift:remediate_pr'
  | 'finops:read'
  | 'dora:read'
  | 'compliance:read'
  | 'compliance:export'
  | 'audit:read'
  | 'integrations:manage';

export const ROLE_PERMISSIONS: Record<RbacRole, Permission[]> = {
  ORG_OWNER: [
    'org:manage', 'billing:manage', 'users:manage', 'api_keys:manage',
    'projects:write', 'projects:read', 'releases:ingest', 'releases:read',
    'releases:approve_prod', 'releases:approve_nonprod', 'migrations:approve',
    'policies:write', 'policies:read', 'policies:simulate',
    'deployments:trigger', 'deployments:promote', 'deployments:rollback',
    'incidents:write', 'incidents:read', 'remediation:propose', 'remediation:approve', 'remediation:execute',
    'sbom:write', 'sbom:read', 'drift:read', 'drift:remediate_pr',
    'finops:read', 'dora:read', 'compliance:read', 'compliance:export',
    'audit:read', 'integrations:manage',
  ],
  PLATFORM_ADMIN: [
    'users:manage', 'api_keys:manage', 'projects:write', 'projects:read',
    'releases:ingest', 'releases:read', 'releases:approve_nonprod',
    'policies:write', 'policies:read', 'policies:simulate',
    'deployments:trigger', 'deployments:promote', 'deployments:rollback',
    'incidents:write', 'incidents:read', 'remediation:propose', 'remediation:approve',
    'sbom:read', 'drift:read', 'drift:remediate_pr',
    'finops:read', 'dora:read', 'compliance:read', 'audit:read', 'integrations:manage',
  ],
  SECURITY_ADMIN: [
    'projects:read', 'releases:read', 'migrations:approve',
    'policies:write', 'policies:read', 'policies:simulate',
    'incidents:read', 'remediation:propose', 'remediation:approve',
    'sbom:write', 'sbom:read', 'drift:read', 'drift:remediate_pr',
    'compliance:read', 'compliance:export', 'audit:read',
  ],
  RELEASE_MANAGER: [
    'projects:read', 'releases:ingest', 'releases:read',
    'releases:approve_prod', 'releases:approve_nonprod', 'migrations:approve',
    'policies:read', 'policies:simulate',
    'deployments:trigger', 'deployments:promote', 'deployments:rollback',
    'incidents:read', 'sbom:read', 'drift:read', 'finops:read', 'dora:read', 'compliance:read',
  ],
  SRE_ONCALL: [
    'projects:read', 'releases:read', 'policies:read',
    'deployments:trigger', 'deployments:promote', 'deployments:rollback',
    'incidents:write', 'incidents:read',
    'remediation:propose', 'remediation:approve', 'remediation:execute',
    'sbom:read', 'drift:read', 'drift:remediate_pr', 'finops:read', 'dora:read',
  ],
  DEV_LEAD: [
    'projects:write', 'projects:read', 'releases:ingest', 'releases:read',
    'releases:approve_nonprod', 'policies:read', 'policies:simulate',
    'deployments:trigger', 'incidents:write', 'incidents:read',
    'remediation:propose', 'sbom:write', 'sbom:read', 'drift:read', 'drift:remediate_pr',
    'finops:read', 'dora:read',
  ],
  DEVELOPER: [
    'projects:read', 'releases:ingest', 'releases:read', 'releases:approve_nonprod',
    'policies:read', 'policies:simulate', 'incidents:read', 'remediation:propose',
    'sbom:write', 'sbom:read', 'drift:read', 'finops:read', 'dora:read',
  ],
  AUDITOR: [
    'projects:read', 'releases:read', 'policies:read', 'incidents:read',
    'sbom:read', 'drift:read', 'finops:read', 'dora:read',
    'compliance:read', 'compliance:export', 'audit:read',
  ],
  VIEWER: [
    'projects:read', 'releases:read', 'policies:read', 'incidents:read',
    'sbom:read', 'drift:read', 'finops:read', 'dora:read',
  ],
};

export function hasPermission(role: RbacRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
