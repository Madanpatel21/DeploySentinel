# Release Governance, Policy Simulation & Separation of Duties

## Policy-as-Code DSL
Policies evaluate deterministically against each release context using declarative fields:
- `maxRiskScore`: ceiling before WARN/BLOCK
- `blockDestructiveSql`: blocks `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, unbounded DML
- `maxCriticalCves`: blocks promotion if SBOM contains critical vulnerabilities
- `requireSbomSignature`: requires verified build/artifact provenance
- `requireSodForProd`: enforces independent approval for production
- `minTestCatchProb`: enforces minimum Intelligent Test Selection confidence
- `blockDuringFreezeWindow`: blocks production deployments during active freeze windows

## Policy Simulation Mode
Before toggling a rule to `mode: "enforce"`, administrators invoke `POST /api/v1/policies/simulate` to evaluate the candidate rule against historical releases and review `currentlyBlocked`, `simulatedBlocked`, and `deltaBlocked`.

## Separation of Duties (SoD)
Production approvals strictly verify `release.author_id !== approver.id` AND `release.author_email !== approver.email`. Self-approval attempts return `403 Forbidden`.
