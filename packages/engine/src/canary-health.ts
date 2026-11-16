export interface TelemetryWindow {
  errorRate: number;      // 0..1 (e.g. 0.004 = 0.4%)
  p95LatencyMs: number;
  rps: number;
  cpuPct: number;
  memPct: number;
  restartCount: number;
}

export interface CanaryVerificationResult {
  healthVerdict: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  anomalyScore: number; // z-score magnitude
  anomalyDetected: boolean;
  errorRateRatio: number;
  latencyDeltaPct: number;
  rollbackRecommended: boolean;
  autoRollbackExecuted: boolean;
  reasons: string[];
}

export function evaluateCanaryTelemetry(
  baseline: TelemetryWindow,
  canary: TelemetryWindow,
  autoRollbackEnabled = false
): CanaryVerificationResult {
  const safeBaselineErr = Math.max(0.0005, baseline.errorRate);
  const errorRateRatio = Number((canary.errorRate / safeBaselineErr).toFixed(2));
  const safeBaselineLat = Math.max(1, baseline.p95LatencyMs);
  const latencyDeltaPct = Number((((canary.p95LatencyMs - safeBaselineLat) / safeBaselineLat) * 100).toFixed(1));

  // Statistical two-proportion / z-score proxy assuming effective sample N = max(100, baseline.rps * 60)
  const n = Math.max(100, (baseline.rps || 20) * 30);
  const pooledP = Math.min(0.99, Math.max(0.0005, (baseline.errorRate + canary.errorRate) / 2));
  const se = Math.sqrt((2 * pooledP * (1 - pooledP)) / n);
  const errZ = se > 0 ? Math.abs(canary.errorRate - baseline.errorRate) / se : 0;

  // Latency z-score proxy assuming baseline std ~ 18% of p95
  const latStd = Math.max(5, baseline.p95LatencyMs * 0.18);
  const latZ = Math.max(0, (canary.p95LatencyMs - baseline.p95LatencyMs) / latStd);

  const anomalyScore = Number(Math.max(errZ, latZ).toFixed(3));
  const reasons: string[] = [];

  if (canary.errorRate > baseline.errorRate * 2 && canary.errorRate >= 0.01) {
    reasons.push(`Canary error rate ${(canary.errorRate * 100).toFixed(2)}% is ${errorRateRatio}x baseline ${(baseline.errorRate * 100).toFixed(2)}%`);
  }
  if (latencyDeltaPct >= 35) {
    reasons.push(`p95 latency increased by +${latencyDeltaPct}% (${baseline.p95LatencyMs}ms -> ${canary.p95LatencyMs}ms)`);
  }
  if (canary.restartCount > baseline.restartCount + 2) {
    reasons.push(`Pod restart count elevated (${canary.restartCount} vs baseline ${baseline.restartCount})`);
  }
  if (canary.cpuPct > 90 || canary.memPct > 90) {
    reasons.push(`Resource saturation detected (CPU ${canary.cpuPct}%, Mem ${canary.memPct}%)`);
  }

  let healthVerdict: CanaryVerificationResult['healthVerdict'] = 'HEALTHY';
  if (canary.errorRate >= 0.05 || errorRateRatio >= 4 || latencyDeltaPct >= 100 || canary.restartCount >= 5) {
    healthVerdict = 'CRITICAL';
  } else if (reasons.length > 0 || anomalyScore >= 2.5) {
    healthVerdict = 'DEGRADED';
  }

  const anomalyDetected = healthVerdict !== 'HEALTHY';
  const rollbackRecommended = healthVerdict === 'CRITICAL' || (healthVerdict === 'DEGRADED' && errorRateRatio >= 2.5);

  return {
    healthVerdict,
    anomalyScore,
    anomalyDetected,
    errorRateRatio,
    latencyDeltaPct,
    rollbackRecommended,
    // Safety invariant: automated rollback NEVER executes unless explicitly enabled
    autoRollbackExecuted: Boolean(autoRollbackEnabled && healthVerdict === 'CRITICAL'),
    reasons: reasons.length > 0 ? reasons : ['Canary metrics remain within statistical baseline bounds.'],
  };
}
