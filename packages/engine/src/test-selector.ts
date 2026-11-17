import type { ChangedFileInput } from '@deploysentinel/shared';

export interface TestCandidate {
  id: string;
  name: string;
  coversPaths: string[];
  category: 'unit' | 'integration' | 'e2e' | 'security' | 'migration';
  avgDurationSec: number;
}

export interface TestSelectionResult {
  strategyVersion: string;
  totalTests: number;
  selectedTests: Array<TestCandidate & { reason: string }>;
  skippedTests: Array<TestCandidate & { reason: string }>;
  mandatorySecurityTests: string[];
  estimatedSavingsPct: number;
  predictedCatchProb: number;
}

const DEFAULT_SUITE: TestCandidate[] = [
  { id: 't-sec-rbac', name: 'RBAC & Tenant Isolation Security Suite', coversPaths: ['auth', 'rbac', 'api', 'security'], category: 'security', avgDurationSec: 42 },
  { id: 't-sec-headers', name: 'API Auth & Injection Guardrails', coversPaths: ['api', 'webhook', 'ai'], category: 'security', avgDurationSec: 30 },
  { id: 't-mig-schema', name: 'SQL Migration & Lock Safety Verification', coversPaths: ['migration', '.sql', 'schema'], category: 'migration', avgDurationSec: 55 },
  { id: 't-unit-risk', name: 'Deterministic Risk Scorer Unit Suite', coversPaths: ['risk', 'engine', 'policy'], category: 'unit', avgDurationSec: 12 },
  { id: 't-int-checkout', name: 'Checkout & Payments Integration Suite', coversPaths: ['checkout', 'payment', 'billing'], category: 'integration', avgDurationSec: 95 },
  { id: 't-e2e-smoke', name: 'Critical User Journey E2E Smoke', coversPaths: ['web', 'app', 'routes', 'gateway'], category: 'e2e', avgDurationSec: 180 },
  { id: 't-unit-docs', name: 'Docs & Static Asset Linter', coversPaths: ['docs', 'README', '.md'], category: 'unit', avgDurationSec: 18 },
];

export function selectIntelligentTests(
  changedFiles: ChangedFileInput[],
  suite?: TestCandidate[],
  riskScore = 40
): TestSelectionResult {
  const candidates = suite && suite.length > 0 ? suite : DEFAULT_SUITE;
  const selected: Array<TestCandidate & { reason: string }> = [];
  const skipped: Array<TestCandidate & { reason: string }> = [];
  const mandatorySecurityTests: string[] = [];

  for (const test of candidates) {
    if (test.category === 'security') {
      mandatorySecurityTests.push(test.id);
      selected.push({ ...test, reason: 'Mandatory security gate (never skipped)' });
      continue;
    }
    const hitsChange = changedFiles.some((f) =>
      test.coversPaths.some((p) => f.path.toLowerCase().includes(p.toLowerCase()))
    );
    if (hitsChange) {
      selected.push({ ...test, reason: 'Covers modified file path(s)' });
    } else if (riskScore >= 75 && test.category === 'e2e') {
      selected.push({ ...test, reason: 'Retained due to HIGH/CRITICAL release risk score' });
    } else if (test.category === 'migration' && changedFiles.some((f) => /\.sql|migration/i.test(f.path))) {
      selected.push({ ...test, reason: 'Mandatory migration safety verification' });
    } else {
      skipped.push({ ...test, reason: 'No path overlap and low regression affinity' });
    }
  }

  const totalSec = candidates.reduce((s, t) => s + t.avgDurationSec, 0) || 1;
  const selectedSec = selected.reduce((s, t) => s + t.avgDurationSec, 0);
  const estimatedSavingsPct = Number(Math.max(0, ((totalSec - selectedSec) / totalSec) * 100).toFixed(2));
  const predictedCatchProb = Number(Math.min(0.995, 0.91 + (selected.length / Math.max(1, candidates.length)) * 0.08).toFixed(3));

  return {
    strategyVersion: 'its-v1.4',
    totalTests: candidates.length,
    selectedTests: selected,
    skippedTests: skipped,
    mandatorySecurityTests,
    estimatedSavingsPct,
    predictedCatchProb,
  };
}
