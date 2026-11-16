import type { ChangedFileInput, RiskFactor, RiskLevel, RiskScoreResult } from '@releaseguard/shared';

export const SCORING_VERSION = 'v2.1.0';

export interface RiskScoringInput {
  changedFiles: ChangedFileInput[];
  environmentTier: 'dev' | 'staging' | 'prod';
  serviceTier: 'TIER_0' | 'TIER_1' | 'TIER_2' | 'TIER_3';
  sqlLockRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  destructiveSqlOpsCount: number;
  criticalCveCount: number;
  highCveCount: number;
  blastRadiusServicesCount: number;
  testCoverageConfidence: number; // 0..1
  activeDriftCount: number;
  historicalFailureRate: number; // 0..1
  slsaVerified: boolean;
}

const CRITICAL_PATH_PATTERNS = [
  /auth/i, /security/i, /payment/i, /billing/i, /migration/i,
  /schema/i, /terraform/i, /k8s/i, /helm/i, /rbac/i, /crypto/i,
];

export function computeDeterministicRiskScore(input: RiskScoringInput): RiskScoreResult {
  const totalLines = input.changedFiles.reduce((s, f) => s + f.additions + f.deletions, 0);
  const criticalFiles = input.changedFiles.filter((f) =>
    CRITICAL_PATH_PATTERNS.some((re) => re.test(f.path))
  );

  const churnNorm = Math.min(1, totalLines / 1500);
  const criticalNorm = input.changedFiles.length === 0
    ? 0
    : Math.min(1, criticalFiles.length / Math.max(1, input.changedFiles.length * 0.5));
  const blastNorm = Math.min(1, input.blastRadiusServicesCount / 8);

  const sqlMap: Record<RiskScoringInput['sqlLockRisk'], number> = {
    NONE: 0,
    LOW: 0.25,
    MEDIUM: 0.55,
    HIGH: 0.85,
    CRITICAL: 1.0,
  };
  const sqlNorm = Math.min(1, sqlMap[input.sqlLockRisk] + (input.destructiveSqlOpsCount > 0 ? 0.25 : 0));

  const cveNorm = Math.min(1, input.criticalCveCount * 0.5 + input.highCveCount * 0.15 + (input.slsaVerified ? 0 : 0.2));
  const testGapNorm = Math.max(0, Math.min(1, 1 - input.testCoverageConfidence));
  const driftNorm = Math.min(1, input.activeDriftCount * 0.25);
  const histNorm = Math.max(0, Math.min(1, input.historicalFailureRate * 2));

  const envMultiplier = input.environmentTier === 'prod' ? 1.12 : input.environmentTier === 'staging' ? 1.0 : 0.85;
  const tierMultiplier = input.serviceTier === 'TIER_0' ? 1.1 : input.serviceTier === 'TIER_1' ? 1.0 : 0.9;

  const factors: RiskFactor[] = [
    {
      dimension: 'Code Churn & Complexity',
      weight: 14,
      rawValue: Number(churnNorm.toFixed(3)),
      contribution: Number((churnNorm * 14).toFixed(2)),
      explanation: `${totalLines} changed lines across ${input.changedFiles.length} file(s)`,
      evidence: input.changedFiles.slice(0, 5).map((f) => `${f.path} (+${f.additions}/-${f.deletions})`),
    },
    {
      dimension: 'Critical Path Sensitivity',
      weight: 18,
      rawValue: Number(criticalNorm.toFixed(3)),
      contribution: Number((criticalNorm * 18).toFixed(2)),
      explanation: `${criticalFiles.length} file(s) touch security, payment, auth, migration, or infra paths`,
      evidence: criticalFiles.slice(0, 5).map((f) => f.path),
    },
    {
      dimension: 'Transitive Blast Radius',
      weight: 14,
      rawValue: Number(blastNorm.toFixed(3)),
      contribution: Number((blastNorm * 14).toFixed(2)),
      explanation: `${input.blastRadiusServicesCount} downstream service(s) in dependency closure`,
      evidence: [`Downstream consumer count: ${input.blastRadiusServicesCount}`],
    },
    {
      dimension: 'Database Migration Lock & Safety',
      weight: 18,
      rawValue: Number(sqlNorm.toFixed(3)),
      contribution: Number((sqlNorm * 18).toFixed(2)),
      explanation: `Lock risk=${input.sqlLockRisk}, destructive ops=${input.destructiveSqlOpsCount}`,
      evidence: [`SQL lock risk tier: ${input.sqlLockRisk}`],
    },
    {
      dimension: 'Supply Chain & Provenance Exposure',
      weight: 14,
      rawValue: Number(cveNorm.toFixed(3)),
      contribution: Number((cveNorm * 14).toFixed(2)),
      explanation: `${input.criticalCveCount} critical CVEs, ${input.highCveCount} high CVEs, SLSA verified=${input.slsaVerified}`,
      evidence: [`Critical CVEs: ${input.criticalCveCount}`, `High CVEs: ${input.highCveCount}`],
    },
    {
      dimension: 'Test Confidence Gap',
      weight: 10,
      rawValue: Number(testGapNorm.toFixed(3)),
      contribution: Number((testGapNorm * 10).toFixed(2)),
      explanation: `Intelligent test confidence ${(input.testCoverageConfidence * 100).toFixed(1)}%`,
      evidence: [`Coverage confidence: ${(input.testCoverageConfidence * 100).toFixed(1)}%`],
    },
    {
      dimension: 'Infrastructure Drift Exposure',
      weight: 6,
      rawValue: Number(driftNorm.toFixed(3)),
      contribution: Number((driftNorm * 6).toFixed(2)),
      explanation: `${input.activeDriftCount} active drift finding(s) in target environment`,
      evidence: [`Active drift count: ${input.activeDriftCount}`],
    },
    {
      dimension: 'Historical Service Failure Rate',
      weight: 6,
      rawValue: Number(histNorm.toFixed(3)),
      contribution: Number((histNorm * 6).toFixed(2)),
      explanation: `Trailing 30d failure rate ${(input.historicalFailureRate * 100).toFixed(1)}%`,
      evidence: [`Trailing CFR: ${(input.historicalFailureRate * 100).toFixed(1)}%`],
    },
  ];

  const rawSum = factors.reduce((s, f) => s + f.contribution, 0);
  const score = Number(Math.min(100, Math.max(0, rawSum * envMultiplier * tierMultiplier)).toFixed(2));

  let level: RiskLevel = 'LOW';
  if (score >= 80 || input.destructiveSqlOpsCount > 0 || input.criticalCveCount > 0) level = 'CRITICAL';
  else if (score >= 55 || input.sqlLockRisk === 'HIGH') level = 'HIGH';
  else if (score >= 30) level = 'MEDIUM';

  const signalsPresent = [
    input.changedFiles.length > 0,
    input.sqlLockRisk !== undefined,
    input.testCoverageConfidence > 0,
    input.slsaVerified !== undefined,
  ].filter(Boolean).length;

  const completeness = Number((signalsPresent / 4).toFixed(3));
  const confidence = Number((0.7 + completeness * 0.27).toFixed(3));
  const requiresManualApproval =
    input.environmentTier === 'prod' || level === 'HIGH' || level === 'CRITICAL' || input.destructiveSqlOpsCount > 0;

  let recommendation = 'Safe for standard progressive rollout.';
  if (level === 'CRITICAL') {
    recommendation = 'BLOCKED pending Security/Release Manager sign-off, destructive SQL remediation, or CVE patching.';
  } else if (level === 'HIGH') {
    recommendation = 'Require Separation-of-Duties approval and 10% canary hold with heightened error-rate telemetry.';
  } else if (level === 'MEDIUM') {
    recommendation = 'Proceed with canary deployment (10% -> 50% -> 100%) and verify intelligent test suite.';
  }

  return {
    score,
    level,
    confidence,
    completeness,
    scoringVersion: SCORING_VERSION,
    factors,
    recommendation,
    requiresManualApproval,
  };
}
