export interface SqlFinding {
  ruleId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  statement: string;
  lockType: string;
  message: string;
  remediation: string;
}

export interface SqlMigrationAnalysisResult {
  filename: string;
  lockRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  destructiveOps: string[];
  findings: SqlFinding[];
  expandContractPlan: string[];
  rollbackSql: string;
  requiresManualApproval: boolean;
}

export function analyzeSqlMigration(filename: string, rawSql: string): SqlMigrationAnalysisResult {
  // Strip single-line and block comments cleanly while splitting statements
  const cleaned = rawSql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const statements = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const findings: SqlFinding[] = [];
  const destructiveOps: string[] = [];
  const rollbackLines: string[] = ['-- Best-effort rollback script (review before executing)'];

  for (const stmt of statements) {
    const upper = stmt.toUpperCase().replace(/\s+/g, ' ');

    const dropTableMatch = upper.match(/DROP TABLE(?:\s+IF EXISTS)?\s+([A-Z0-9_."]+)/);
    if (dropTableMatch) {
      destructiveOps.push(`DROP TABLE ${dropTableMatch[1]}`);
      findings.push({
        ruleId: 'SQL_DESTRUCTIVE_DROP_TABLE',
        severity: 'CRITICAL',
        statement: stmt,
        lockType: 'ACCESS EXCLUSIVE',
        message: `Dropping table ${dropTableMatch[1]} permanently deletes all rows and breaks active readers.`,
        remediation: 'Use Expand-and-Contract: stop reads/writes, archive table via rename, drop in a subsequent release.',
      });
    }

    const dropColMatch = upper.match(/ALTER TABLE\s+([A-Z0-9_."]+)\s+DROP COLUMN\s+(?:IF EXISTS\s+)?([A-Z0-9_"]+)/);
    if (dropColMatch) {
      destructiveOps.push(`DROP COLUMN ${dropColMatch[1]}.${dropColMatch[2]}`);
      findings.push({
        ruleId: 'SQL_DESTRUCTIVE_DROP_COLUMN',
        severity: 'CRITICAL',
        statement: stmt,
        lockType: 'ACCESS EXCLUSIVE',
        message: `Dropping column ${dropColMatch[2]} on ${dropColMatch[1]} causes immediate runtime errors on older app pods.`,
        remediation: 'Remove column references in application code first, deploy, then drop column in a later migration.',
      });
    }

    if (/\bTRUNCATE\b/.test(upper)) {
      destructiveOps.push('TRUNCATE');
      findings.push({
        ruleId: 'SQL_DESTRUCTIVE_TRUNCATE',
        severity: 'CRITICAL',
        statement: stmt,
        lockType: 'ACCESS EXCLUSIVE',
        message: 'TRUNCATE wipes table data non-recoverably and acquires ACCESS EXCLUSIVE lock.',
        remediation: 'Require explicit DBA approval and verified backup snapshot before execution.',
      });
    }

    const alterTypeMatch = upper.match(/ALTER TABLE\s+([A-Z0-9_."]+)\s+ALTER COLUMN\s+([A-Z0-9_"]+)\s+(?:SET DATA\s+)?TYPE/);
    if (alterTypeMatch) {
      findings.push({
        ruleId: 'SQL_TABLE_REWRITE_ALTER_TYPE',
        severity: 'HIGH',
        statement: stmt,
        lockType: 'ACCESS EXCLUSIVE (full table rewrite)',
        message: `Changing column type on ${alterTypeMatch[1]}.${alterTypeMatch[2]} rewrites the entire table under an exclusive lock.`,
        remediation: 'Add a new shadow column, dual-write + backfill in batches, swap views/code, then drop old column.',
      });
    }

    const addColNotNull = upper.match(/ALTER TABLE\s+([A-Z0-9_."]+)\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?([A-Z0-9_"]+)\s+.*NOT NULL/);
    if (addColNotNull && !/\bDEFAULT\b/.test(upper)) {
      findings.push({
        ruleId: 'SQL_ADD_NOT_NULL_NO_DEFAULT',
        severity: 'HIGH',
        statement: stmt,
        lockType: 'ACCESS EXCLUSIVE',
        message: `Adding NOT NULL column ${addColNotNull[2]} without DEFAULT fails on non-empty tables.`,
        remediation: 'Add nullable column first, backfill values, add CHECK NOT VALID, then VALIDATE CONSTRAINT.',
      });
    }

    const addColSafe = stmt.match(/ALTER\s+TABLE\s+([a-zA-Z0-9_."]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_"]+)/i);
    if (addColSafe) {
      rollbackLines.push(`ALTER TABLE ${addColSafe[1]} DROP COLUMN IF EXISTS ${addColSafe[2]};`);
    }

    if (/CREATE\s+(?:UNIQUE\s+)?INDEX\b/.test(upper) && !/\bCONCURRENTLY\b/.test(upper)) {
      const idxMatch = stmt.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_"]+)/i);
      findings.push({
        ruleId: 'SQL_NON_CONCURRENT_INDEX',
        severity: 'MEDIUM',
        statement: stmt,
        lockType: 'SHARE (blocks INSERT/UPDATE/DELETE)',
        message: 'CREATE INDEX without CONCURRENTLY blocks all writes for the duration of index build.',
        remediation: 'Use CREATE INDEX CONCURRENTLY outside a transaction block.',
      });
      if (idxMatch) {
        rollbackLines.push(`DROP INDEX CONCURRENTLY IF EXISTS ${idxMatch[1]};`);
      }
    }

    if (/^(DELETE FROM|UPDATE)\b/.test(upper) && !/\bWHERE\b/.test(upper)) {
      destructiveOps.push('UNBOUNDED_DML_NO_WHERE');
      findings.push({
        ruleId: 'SQL_UNBOUNDED_DML',
        severity: 'CRITICAL',
        statement: stmt,
        lockType: 'ROW EXCLUSIVE (all rows)',
        message: 'DELETE/UPDATE without WHERE clause mutates every row in the table.',
        remediation: 'Add an explicit indexed WHERE predicate and execute in bounded batches.',
      });
    }
  }

  let lockRisk: SqlMigrationAnalysisResult['lockRisk'] = 'NONE';
  if (findings.some((f) => f.severity === 'CRITICAL')) lockRisk = 'CRITICAL';
  else if (findings.some((f) => f.severity === 'HIGH')) lockRisk = 'HIGH';
  else if (findings.some((f) => f.severity === 'MEDIUM')) lockRisk = 'MEDIUM';
  else if (statements.length > 0) lockRisk = 'LOW';

  const requiresManualApproval =
    destructiveOps.length > 0 || lockRisk === 'HIGH' || lockRisk === 'CRITICAL';

  const expandContractPlan = requiresManualApproval
    ? [
        '1. Expand: Introduce nullable target columns / shadow tables with zero blocking locks.',
        '2. Dual-write & Backfill: Deploy application dual-write and backfill historical rows in throttled batches.',
        '3. Switch Reads & Validate: Switch read queries to new schema; run CHECK (...) NOT VALID then VALIDATE.',
        '4. Contract: In a separate follow-up release after burn-in, drop deprecated columns/tables with manual approval.',
      ]
    : ['Standard zero-downtime migration path validated; safe to apply with statement_timeout=5s.'];

  return {
    filename,
    lockRisk,
    destructiveOps,
    findings,
    expandContractPlan,
    rollbackSql: rollbackLines.join('\n'),
    requiresManualApproval,
  };
}
