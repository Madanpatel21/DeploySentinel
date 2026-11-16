export type AutonomyLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export interface RemediationProposal {
  autonomyLevel: AutonomyLevel;
  actionType: string;
  title: string;
  reversibility: 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'NON_REVERSIBLE';
  requiresHumanApproval: boolean;
  steps: string[];
  rollbackPlan: string;
}

export function validateRemediationAction(
  autonomyLevel: AutonomyLevel,
  actionType: string,
  environmentTier: 'dev' | 'staging' | 'prod'
): RemediationProposal {
  const highImpact = /rollback|scale|failover|restart|feature_flag_kill|db_kill_query/i.test(actionType);
  const requiresHumanApproval =
    environmentTier === 'prod' || autonomyLevel === 'L2' || autonomyLevel === 'L3' || highImpact;

  return {
    autonomyLevel,
    actionType,
    title: `Controlled ${actionType.replace(/_/g, ' ')} (${autonomyLevel})`,
    reversibility: /db_kill|drop/i.test(actionType) ? 'PARTIALLY_REVERSIBLE' : 'REVERSIBLE',
    requiresHumanApproval,
    steps: [
      `1. Snapshot current ${environmentTier} state & verify blast radius.`,
      `2. Execute ${actionType} under ${autonomyLevel} guardrails.`,
      `3. Monitor error rate and p95 latency for 5 minutes post-action.`,
    ],
    rollbackPlan: `Revert ${actionType} to pre-action snapshot via ReleaseGuard Control Center.`,
  };
}

export interface DriftComparisonResult {
  resourceAddress: string;
  provider: 'terraform' | 'kubernetes';
  driftType: 'MODIFIED' | 'UNMANAGED' | 'DELETED' | 'PUBLIC_EXPOSURE' | 'IAM_ESCALATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  publicExposure: boolean;
  changedKeys: string[];
  patchPrDiff: string;
}

export function detectInfraDrift(
  provider: 'terraform' | 'kubernetes',
  resourceAddress: string,
  desiredState: Record<string, unknown>,
  liveState: Record<string, unknown>
): DriftComparisonResult | null {
  const keys = new Set([...Object.keys(desiredState), ...Object.keys(liveState)]);
  const changedKeys: string[] = [];

  for (const k of keys) {
    if (JSON.stringify(desiredState[k]) !== JSON.stringify(liveState[k])) {
      changedKeys.push(k);
    }
  }
  if (changedKeys.length === 0) return null;

  const liveStr = JSON.stringify(liveState);
  const publicExposure = /0\.0\.0\.0\/0|"publicly_accessible":true|"LoadBalancer"/i.test(liveStr) &&
    !/0\.0\.0\.0\/0|"publicly_accessible":true/i.test(JSON.stringify(desiredState));
  const iamEscalation = /"Action":"?\*"|"AdministratorAccess"|"privileged":true/i.test(liveStr);

  const driftType: DriftComparisonResult['driftType'] = publicExposure
    ? 'PUBLIC_EXPOSURE'
    : iamEscalation
      ? 'IAM_ESCALATION'
      : Object.keys(desiredState).length === 0
        ? 'UNMANAGED'
        : 'MODIFIED';

  const severity: DriftComparisonResult['severity'] =
    publicExposure || iamEscalation ? 'CRITICAL' : changedKeys.length > 2 ? 'HIGH' : 'MEDIUM';

  const patchLines = [
    `--- desired/${provider}/${resourceAddress}`,
    `+++ reconcile/${provider}/${resourceAddress}`,
    ...changedKeys.map((k) => `- live.${k} = ${JSON.stringify(liveState[k])}\n+ desired.${k} = ${JSON.stringify(desiredState[k])}`),
  ];

  return {
    resourceAddress,
    provider,
    driftType,
    severity,
    publicExposure,
    changedKeys,
    patchPrDiff: patchLines.join('\n'),
  };
}

export interface FinOpsManifestInput {
  replicasDelta: number;
  vcpuPerReplica: number;
  memoryGbPerReplica: number;
  storageGbDelta?: number;
}

export function estimateDeploymentFinOpsDelta(input: FinOpsManifestInput): {
  monthlyDeltaUsd: number;
  costBreakdown: Record<string, number>;
  confidenceNote: string;
  sourceType: 'MANIFEST_ESTIMATE';
} {
  // Transparent deterministic cloud unit-rate estimation (on-demand baseline rates)
  const VCPU_MONTHLY_USD = 29.2;      // ~$0.04/vCPU-hr * 730h
  const MEM_GB_MONTHLY_USD = 3.65;    // ~$0.005/GB-hr * 730h
  const STORAGE_GB_MONTHLY_USD = 0.1;

  const computeUsd = Number((input.replicasDelta * input.vcpuPerReplica * VCPU_MONTHLY_USD).toFixed(2));
  const memoryUsd = Number((input.replicasDelta * input.memoryGbPerReplica * MEM_GB_MONTHLY_USD).toFixed(2));
  const storageUsd = Number(((input.storageGbDelta ?? 0) * STORAGE_GB_MONTHLY_USD).toFixed(2));
  const monthlyDeltaUsd = Number((computeUsd + memoryUsd + storageUsd).toFixed(2));

  return {
    monthlyDeltaUsd,
    costBreakdown: { computeUsd, memoryUsd, storageUsd },
    confidenceNote: 'Estimated from Kubernetes/Terraform manifest deltas using standard on-demand unit rates ($0.04/vCPU-hr, $0.005/GB-hr); not live cloud billing.',
    sourceType: 'MANIFEST_ESTIMATE',
  };
}

export interface DoraSummary {
  scope: 'ORGANIZATION' | 'PROJECT';
  ethicalGuarantee: 'NO_INDIVIDUAL_DEVELOPER_RANKING';
  totalDeployments: number;
  avgDeploysPerDay: number;
  avgLeadTimeHours: number;
  changeFailureRatePct: number;
  avgMttrHours: number;
  doraTier: 'ELITE' | 'HIGH' | 'MEDIUM' | 'LOW';
  primaryBottleneck: string;
}

export function computeTeamDoraMetrics(
  dailyRows: Array<{ deployCount: number; leadTimeHours: number; changeFailureRate: number; mttrHours: number; bottleneckStage: string }>,
  scope: 'ORGANIZATION' | 'PROJECT' = 'PROJECT'
): DoraSummary {
  if (dailyRows.length === 0) {
    return {
      scope,
      ethicalGuarantee: 'NO_INDIVIDUAL_DEVELOPER_RANKING',
      totalDeployments: 0,
      avgDeploysPerDay: 0,
      avgLeadTimeHours: 0,
      changeFailureRatePct: 0,
      avgMttrHours: 0,
      doraTier: 'MEDIUM',
      primaryBottleneck: 'insufficient_data',
    };
  }

  const totalDeployments = dailyRows.reduce((s, r) => s + r.deployCount, 0);
  const avgDeploysPerDay = Number((totalDeployments / dailyRows.length).toFixed(2));
  const avgLeadTimeHours = Number((dailyRows.reduce((s, r) => s + r.leadTimeHours, 0) / dailyRows.length).toFixed(2));
  const cfr = dailyRows.reduce((s, r) => s + r.changeFailureRate, 0) / dailyRows.length;
  const changeFailureRatePct = Number((cfr * 100).toFixed(2));
  const avgMttrHours = Number((dailyRows.reduce((s, r) => s + r.mttrHours, 0) / dailyRows.length).toFixed(2));

  const stageCounts = new Map<string, number>();
  for (const r of dailyRows) {
    stageCounts.set(r.bottleneckStage, (stageCounts.get(r.bottleneckStage) ?? 0) + 1);
  }
  const primaryBottleneck = [...stageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'review';

  let doraTier: DoraSummary['doraTier'] = 'MEDIUM';
  if (avgDeploysPerDay >= 1 && avgLeadTimeHours <= 24 && changeFailureRatePct <= 15 && avgMttrHours <= 1) {
    doraTier = 'ELITE';
  } else if (avgDeploysPerDay >= 0.25 && avgLeadTimeHours <= 168 && changeFailureRatePct <= 20) {
    doraTier = 'HIGH';
  } else if (changeFailureRatePct > 35) {
    doraTier = 'LOW';
  }

  return {
    scope,
    ethicalGuarantee: 'NO_INDIVIDUAL_DEVELOPER_RANKING',
    totalDeployments,
    avgDeploysPerDay,
    avgLeadTimeHours,
    changeFailureRatePct,
    avgMttrHours,
    doraTier,
    primaryBottleneck,
  };
}

export function assessChaosReadiness(input: {
  hasCanaryStrategy: boolean;
  hasHealthTelemetry: boolean;
  hasRollbackPlan: boolean;
  hasSloDefined: boolean;
  environmentTier: 'dev' | 'staging' | 'prod';
}) {
  const gaps: string[] = [];
  let score = 20;
  if (input.hasCanaryStrategy) score += 25; else gaps.push('Missing progressive canary traffic shifting strategy');
  if (input.hasHealthTelemetry) score += 25; else gaps.push('Missing OTel baseline vs canary telemetry snapshots');
  if (input.hasRollbackPlan) score += 15; else gaps.push('Missing verified rollback plan / SQL down-migration');
  if (input.hasSloDefined) score += 15; else gaps.push('Missing latency/error SLO thresholds');

  return {
    readinessScore: Math.min(100, score),
    gaps,
    prodBlocked: true, // Always block automated chaos injection in production
    recommendedExperiments: [
      { id: 'chaos-lat-1', name: 'Staging Downstream Latency +150ms Injection', targetEnv: 'staging', safeForProd: false },
      { id: 'chaos-pod-2', name: 'Non-Prod Replica Termination & Readiness Probe Check', targetEnv: 'staging', safeForProd: false },
    ],
  };
}
