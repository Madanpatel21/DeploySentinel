export interface ReplayEvent {
  timestamp: string;
  stage: 'commit' | 'risk_scoring' | 'sql_check' | 'sbom_scan' | 'policy_gate' | 'deployment' | 'telemetry' | 'incident' | 'remediation';
  title: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  details: string;
}

export interface IncidentInvestigationResult {
  observedEvidence: string[];
  causalHypotheses: Array<{
    rank: number;
    hypothesis: string;
    confidence: number;
    supportingEvidence: string[];
  }>;
  postmortemMd: string;
}

export interface PredictiveCalibrationMetrics {
  sampleCount: number;
  precision: number;
  recall: number;
  f1Score: number;
  brierScore: number;
  avgPredictedProb: number;
  actualIncidentRate: number;
}

export function buildReleaseReplayTimeline(input: {
  releaseVersion: string;
  createdAt: string;
  riskScore: number;
  riskLevel: string;
  sqlLockRisk?: string;
  cveCount?: number;
  policyVerdicts?: Array<{ policyName: string; verdict: string }>;
  deploymentStartedAt?: string;
  healthVerdict?: string;
  incidentTitle?: string;
  incidentDetectedAt?: string;
  remediationTitle?: string;
  remediationAt?: string;
}): ReplayEvent[] {
  const events: ReplayEvent[] = [
    {
      timestamp: input.createdAt,
      stage: 'commit',
      title: `Release ${input.releaseVersion} ingested`,
      severity: 'INFO',
      details: 'Git diff, dependencies, and artifact metadata captured.',
    },
    {
      timestamp: input.createdAt,
      stage: 'risk_scoring',
      title: `Deterministic Risk Score: ${input.riskScore} (${input.riskLevel})`,
      severity: input.riskLevel === 'CRITICAL' ? 'CRITICAL' : input.riskLevel === 'HIGH' ? 'WARN' : 'INFO',
      details: `Evaluated across 8 deterministic dimensions.`,
    },
  ];

  if (input.sqlLockRisk && input.sqlLockRisk !== 'NONE') {
    events.push({
      timestamp: input.createdAt,
      stage: 'sql_check',
      title: `SQL Migration Lock Risk: ${input.sqlLockRisk}`,
      severity: input.sqlLockRisk === 'CRITICAL' || input.sqlLockRisk === 'HIGH' ? 'CRITICAL' : 'WARN',
      details: 'Static DDL analyzer flagged lock-acquiring migration operations.',
    });
  }

  if ((input.cveCount ?? 0) > 0) {
    events.push({
      timestamp: input.createdAt,
      stage: 'sbom_scan',
      title: `SBOM Scan detected ${input.cveCount} vulnerability finding(s)`,
      severity: 'WARN',
      details: 'CycloneDX/SPDX inventory correlated against advisory index.',
    });
  }

  for (const pv of input.policyVerdicts ?? []) {
    events.push({
      timestamp: input.createdAt,
      stage: 'policy_gate',
      title: `Policy "${pv.policyName}": ${pv.verdict}`,
      severity: pv.verdict === 'BLOCK' ? 'CRITICAL' : pv.verdict === 'WARN' ? 'WARN' : 'INFO',
      details: `Governance rule evaluation result.`,
    });
  }

  if (input.deploymentStartedAt) {
    events.push({
      timestamp: input.deploymentStartedAt,
      stage: 'deployment',
      title: `Deployment initiated (${input.healthVerdict ?? 'MONITORING'})`,
      severity: input.healthVerdict === 'CRITICAL' ? 'CRITICAL' : input.healthVerdict === 'DEGRADED' ? 'WARN' : 'INFO',
      details: 'Progressive rollout started with baseline vs canary comparison.',
    });
  }

  if (input.incidentTitle && input.incidentDetectedAt) {
    events.push({
      timestamp: input.incidentDetectedAt,
      stage: 'incident',
      title: `Incident detected: ${input.incidentTitle}`,
      severity: 'CRITICAL',
      details: 'Correlated to recent deployment window and telemetry anomaly.',
    });
  }

  if (input.remediationTitle && input.remediationAt) {
    events.push({
      timestamp: input.remediationAt,
      stage: 'remediation',
      title: `Remediation: ${input.remediationTitle}`,
      severity: 'INFO',
      details: 'Operator-approved remediation action tracked.',
    });
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function investigateIncident(input: {
  title: string;
  severity: string;
  releaseVersion?: string;
  riskScore?: number;
  sqlLockRisk?: string;
  changedFiles?: string[];
  errorRateRatio?: number;
  latencyDeltaPct?: number;
  driftDetected?: boolean;
}): IncidentInvestigationResult {
  const observedEvidence: string[] = [
    `Incident "${input.title}" classified as ${input.severity}.`,
  ];
  if (input.releaseVersion) {
    observedEvidence.push(`Preceded by release ${input.releaseVersion} (risk score ${input.riskScore ?? 'N/A'}).`);
  }
  if (input.errorRateRatio && input.errorRateRatio > 1.5) {
    observedEvidence.push(`Observed error rate spike of ${input.errorRateRatio}x over pre-release baseline.`);
  }
  if (input.latencyDeltaPct && input.latencyDeltaPct > 20) {
    observedEvidence.push(`Observed p95 latency regression of +${input.latencyDeltaPct}%.`);
  }
  if (input.sqlLockRisk === 'HIGH' || input.sqlLockRisk === 'CRITICAL') {
    observedEvidence.push(`Release contained ${input.sqlLockRisk}-lock-risk SQL DDL migration.`);
  }
  if (input.driftDetected) {
    observedEvidence.push(`Active infrastructure configuration drift detected in target environment.`);
  }

  const hypotheses: IncidentInvestigationResult['causalHypotheses'] = [];
  if (input.sqlLockRisk === 'HIGH' || input.sqlLockRisk === 'CRITICAL') {
    hypotheses.push({
      rank: 1,
      hypothesis: 'Database lock contention from unmitigated schema migration starved application connection pools.',
      confidence: 0.86,
      supportingEvidence: observedEvidence.filter((e) => /SQL|latency|release/i.test(e)),
    });
  }
  if ((input.errorRateRatio ?? 1) >= 2) {
    hypotheses.push({
      rank: hypotheses.length + 1,
      hypothesis: `Application regression introduced in modified files (${(input.changedFiles ?? []).slice(0, 3).join(', ') || 'service routes'}).`,
      confidence: 0.78,
      supportingEvidence: observedEvidence.filter((e) => /error rate|release/i.test(e)),
    });
  }
  if (input.driftDetected) {
    hypotheses.push({
      rank: hypotheses.length + 1,
      hypothesis: 'Environment configuration drift altered runtime capacity or network routing behavior.',
      confidence: 0.64,
      supportingEvidence: observedEvidence.filter((e) => /drift/i.test(e)),
    });
  }
  if (hypotheses.length === 0) {
    hypotheses.push({
      rank: 1,
      hypothesis: 'External upstream dependency degradation or transient traffic surge.',
      confidence: 0.52,
      supportingEvidence: observedEvidence,
    });
  }

  const postmortemMd = [
    `# Blameless Postmortem: ${input.title}`,
    `**Severity:** ${input.severity} | **Correlated Release:** ${input.releaseVersion ?? 'Unlinked'}`,
    '',
    '## Observed Telemetry & Facts',
    ...observedEvidence.map((e) => `- ${e}`),
    '',
    '## Ranked Causal Hypotheses (Inferred)',
    ...hypotheses.map((h) => `${h.rank}. **(${Math.round(h.confidence * 100)}% confidence)** ${h.hypothesis}`),
    '',
    '## Action Items',
    '- Enforce Expand-and-Contract SQL gate in Policy Engine.',
    '- Keep progressive canary hold at 10% for >=15 minutes on Tier-0/1 services.',
  ].join('\n');

  return { observedEvidence, causalHypotheses: hypotheses, postmortemMd };
}

export function computePredictiveCalibration(
  outcomes: Array<{ predictedIncidentProb: number; actualIncidentOccurred: boolean }>
): PredictiveCalibrationMetrics {
  if (outcomes.length === 0) {
    return {
      sampleCount: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      brierScore: 0,
      avgPredictedProb: 0,
      actualIncidentRate: 0,
    };
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let brierSum = 0;
  let probSum = 0;
  let actualSum = 0;

  for (const o of outcomes) {
    const predPos = o.predictedIncidentProb >= 0.5;
    const actual = o.actualIncidentOccurred ? 1 : 0;
    if (predPos && actual === 1) tp++;
    if (predPos && actual === 0) fp++;
    if (!predPos && actual === 1) fn++;
    brierSum += Math.pow(o.predictedIncidentProb - actual, 2);
    probSum += o.predictedIncidentProb;
    actualSum += actual;
  }

  const precision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(3)) : 0;
  const recall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(3)) : 0;
  const f1Score = precision + recall > 0 ? Number(((2 * precision * recall) / (precision + recall)).toFixed(3)) : 0;

  return {
    sampleCount: outcomes.length,
    precision,
    recall,
    f1Score,
    brierScore: Number((brierSum / outcomes.length).toFixed(4)),
    avgPredictedProb: Number((probSum / outcomes.length).toFixed(3)),
    actualIncidentRate: Number((actualSum / outcomes.length).toFixed(3)),
  };
}
