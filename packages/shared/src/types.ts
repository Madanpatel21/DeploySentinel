import { z } from 'zod';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFactor {
  dimension: string;
  weight: number;
  rawValue: number;
  contribution: number;
  explanation: string;
  evidence: string[];
}

export interface RiskScoreResult {
  score: number;
  level: RiskLevel;
  confidence: number;
  completeness: number;
  scoringVersion: string;
  factors: RiskFactor[];
  recommendation: string;
  requiresManualApproval: boolean;
}

export interface ChangedFileInput {
  path: string;
  additions: number;
  deletions: number;
  changeType?: 'added' | 'modified' | 'deleted' | 'renamed';
}

export interface ServiceNode {
  id: string;
  name: string;
  tier: 'TIER_0' | 'TIER_1' | 'TIER_2' | 'TIER_3';
  dependencies: string[];
  ownedPaths: string[];
}

export const IngestReleaseSchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid().optional(),
  version: z.string().min(1).max(64),
  gitSha: z.string().min(7).max(64),
  branch: z.string().min(1).max(128).default('main'),
  prNumber: z.number().int().positive().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).default(''),
  changedFiles: z.array(z.object({
    path: z.string().min(1),
    additions: z.number().int().min(0),
    deletions: z.number().int().min(0),
    changeType: z.enum(['added', 'modified', 'deleted', 'renamed']).optional(),
  })).default([]),
  sqlMigrations: z.array(z.object({
    filename: z.string().min(1),
    sql: z.string().min(1),
  })).default([]),
  packageJson: z.record(z.unknown()).optional(),
  lockfileDependencies: z.array(z.object({
    name: z.string(),
    version: z.string(),
    license: z.string().optional(),
    purl: z.string().optional(),
  })).optional(),
  availableTests: z.array(z.object({
    id: z.string(),
    name: z.string(),
    coversPaths: z.array(z.string()),
    category: z.enum(['unit', 'integration', 'e2e', 'security', 'migration']),
    avgDurationSec: z.number().positive(),
  })).optional(),
  slsaLevel: z.number().int().min(0).max(4).default(2),
  signatureVerified: z.boolean().default(true),
  idempotencyKey: z.string().max(128).optional(),
});

export type IngestReleaseInput = z.infer<typeof IngestReleaseSchema>;
