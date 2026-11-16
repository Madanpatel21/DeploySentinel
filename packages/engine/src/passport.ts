import crypto from 'node:crypto';

export interface ReadinessPassportPayload {
  releaseId: string;
  organizationId: string;
  version: string;
  gitSha: string;
  riskScore: number;
  riskLevel: string;
  scoringVersion: string;
  sqlLockRisk: string;
  cveCount: number;
  policyPassed: boolean;
  issuedAt: string;
}

export function signReadinessPassport(payload: ReadinessPassportPayload, secret: string): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const hmac = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return `rgp_v1.${hmac}`;
}

export function verifyReadinessPassport(payload: ReadinessPassportPayload, signature: string, secret: string): boolean {
  const expected = signReadinessPassport(payload, secret);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
