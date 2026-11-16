export interface PolicyRuleDsl {
  maxRiskScore?: number;
  blockDestructiveSql?: boolean;
  maxCriticalCves?: number;
  requireSbomSignature?: boolean;
  requireSodForProd?: boolean;
  minTestCatchProb?: number;
  blockDuringFreezeWindow?: boolean;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  category: 'RISK' | 'SECURITY' | 'DATABASE' | 'GOVERNANCE' | 'FINOPS' | 'COMPLIANCE';
  ruleDsl: PolicyRuleDsl;
  mode: 'enforce' | 'simulate';
  severity: 'WARN' | 'BLOCK';
  enabled: boolean;
}

export interface PolicyEvalContext {
  releaseId: string;
  releaseVersion: string;
  environmentTier: 'dev' | 'staging' | 'prod';
  riskScore: number;
  destructiveSqlCount: number;
  criticalCveCount: number;
  sbomSignatureVerified: boolean;
  testCatchProb: number;
  inFreezeWindow: boolean;
  hasValidSodApproval: boolean;
}

export interface PolicyEvalResult {
  policyId: string;
  policyName: string;
  mode: 'enforce' | 'simulate';
  verdict: 'PASS' | 'WARN' | 'BLOCK';
  reasons: string[];
  simulated: boolean;
}

export function evaluatePolicies(
  policies: PolicyDefinition[],
  ctx: PolicyEvalContext,
  forceSimulate = false
): PolicyEvalResult[] {
  const results: PolicyEvalResult[] = [];

  for (const policy of policies) {
    if (!policy.enabled) continue;
    const reasons: string[] = [];
    const dsl = policy.ruleDsl;

    if (dsl.maxRiskScore !== undefined && ctx.riskScore > dsl.maxRiskScore) {
      reasons.push(`Risk score ${ctx.riskScore} exceeds threshold ${dsl.maxRiskScore}`);
    }
    if (dsl.blockDestructiveSql && ctx.destructiveSqlCount > 0) {
      reasons.push(`Detected ${ctx.destructiveSqlCount} destructive SQL operation(s)`);
    }
    if (dsl.maxCriticalCves !== undefined && ctx.criticalCveCount > dsl.maxCriticalCves) {
      reasons.push(`Found ${ctx.criticalCveCount} critical CVE(s) (max allowed ${dsl.maxCriticalCves})`);
    }
    if (dsl.requireSbomSignature && !ctx.sbomSignatureVerified) {
      reasons.push('Artifact SBOM / SLSA signature is unverified');
    }
    if (dsl.minTestCatchProb !== undefined && ctx.testCatchProb < dsl.minTestCatchProb) {
      reasons.push(`Test catch probability ${ctx.testCatchProb} below minimum ${dsl.minTestCatchProb}`);
    }
    if (dsl.blockDuringFreezeWindow && ctx.inFreezeWindow && ctx.environmentTier === 'prod') {
      reasons.push('Production release falls inside an active change freeze window');
    }
    if (dsl.requireSodForProd && ctx.environmentTier === 'prod' && !ctx.hasValidSodApproval) {
      reasons.push('Production release requires Separation-of-Duties approval from a non-author');
    }

    const effectiveMode = forceSimulate ? 'simulate' : policy.mode;
    const verdict: 'PASS' | 'WARN' | 'BLOCK' =
      reasons.length === 0 ? 'PASS' : policy.severity === 'WARN' ? 'WARN' : 'BLOCK';

    results.push({
      policyId: policy.id,
      policyName: policy.name,
      mode: effectiveMode,
      verdict,
      reasons,
      simulated: effectiveMode === 'simulate',
    });
  }

  return results;
}

export function verifySeparationOfDuties(authorId: string | null, authorEmail: string, approverId: string, approverEmail: string): {
  valid: boolean;
  reason: string;
} {
  if (authorId && authorId === approverId) {
    return { valid: false, reason: 'Separation of Duties violation: author cannot approve their own release.' };
  }
  if (authorEmail.toLowerCase() === approverEmail.toLowerCase()) {
    return { valid: false, reason: 'Separation of Duties violation: author email matches approver email.' };
  }
  return { valid: true, reason: 'Independent approver verified (author != approver).' };
}

export interface PolicySimulationReport {
  totalHistoricalReleases: number;
  currentlyBlocked: number;
  simulatedBlocked: number;
  deltaBlocked: number;
  newlyBlockedReleaseIds: string[];
}

export function simulatePolicyImpact(
  candidatePolicy: PolicyDefinition,
  historicalContexts: PolicyEvalContext[],
  existingResultsByRelease: Record<string, PolicyEvalResult[]>
): PolicySimulationReport {
  let currentlyBlocked = 0;
  let simulatedBlocked = 0;
  const newlyBlockedReleaseIds: string[] = [];

  for (const ctx of historicalContexts) {
    const existingBlocked = (existingResultsByRelease[ctx.releaseId] ?? []).some(
      (r) => !r.simulated && r.verdict === 'BLOCK'
    );
    if (existingBlocked) currentlyBlocked++;

    const [sim] = evaluatePolicies([candidatePolicy], ctx, true);
    const simBlocks = sim?.verdict === 'BLOCK';
    if (existingBlocked || simBlocks) simulatedBlocked++;
    if (!existingBlocked && simBlocks) newlyBlockedReleaseIds.push(ctx.releaseId);
  }

  return {
    totalHistoricalReleases: historicalContexts.length,
    currentlyBlocked,
    simulatedBlocked,
    deltaBlocked: simulatedBlocked - currentlyBlocked,
    newlyBlockedReleaseIds,
  };
}
