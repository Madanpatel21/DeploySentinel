export const SAAS_PLANS = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
export type SaasPlan = (typeof SAAS_PLANS)[number];

export interface PlanEntitlements {
  plan: SaasPlan;
  monthlyPriceUsd: number;
  maxProjects: number | null;
  maxReleasesPerMonth: number | null;
  rbacRolesCount: number;
  policySimulation: boolean;
  digitalTwin: boolean;
  canaryStatisticalGate: boolean;
  complianceFrameworks: string[];
  retentionDays: number;
}

export const PLAN_ENTITLEMENTS: Record<SaasPlan, PlanEntitlements> = {
  FREE: {
    plan: 'FREE',
    monthlyPriceUsd: 0,
    maxProjects: 2,
    maxReleasesPerMonth: 50,
    rbacRolesCount: 3,
    policySimulation: false,
    digitalTwin: true,
    canaryStatisticalGate: false,
    complianceFrameworks: ['SOC2'],
    retentionDays: 14,
  },
  STARTER: {
    plan: 'STARTER',
    monthlyPriceUsd: 149,
    maxProjects: 10,
    maxReleasesPerMonth: 500,
    rbacRolesCount: 5,
    policySimulation: true,
    digitalTwin: true,
    canaryStatisticalGate: true,
    complianceFrameworks: ['SOC2', 'OWASP_ASVS'],
    retentionDays: 90,
  },
  PROFESSIONAL: {
    plan: 'PROFESSIONAL',
    monthlyPriceUsd: 699,
    maxProjects: 50,
    maxReleasesPerMonth: 5000,
    rbacRolesCount: 9,
    policySimulation: true,
    digitalTwin: true,
    canaryStatisticalGate: true,
    complianceFrameworks: ['SOC2', 'ISO27001', 'NIST_CSF', 'OWASP_ASVS', 'GDPR'],
    retentionDays: 365,
  },
  ENTERPRISE: {
    plan: 'ENTERPRISE',
    monthlyPriceUsd: 2499,
    maxProjects: null,
    maxReleasesPerMonth: null,
    rbacRolesCount: 9,
    policySimulation: true,
    digitalTwin: true,
    canaryStatisticalGate: true,
    complianceFrameworks: ['SOC2', 'ISO27001', 'NIST_CSF', 'OWASP_ASVS', 'SLSA', 'GDPR'],
    retentionDays: 2555,
  },
};
