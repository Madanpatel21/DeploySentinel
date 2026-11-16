# Deterministic Release Risk Scoring Model (`v2.1.0`)

ReleaseGuard computes an explainable, reproducible risk score `0–100` across **8 deterministic weighted dimensions**, adjusted by environment tier (`prod: 1.12x`, `staging: 1.0x`, `dev: 0.85x`) and service tier (`TIER_0: 1.10x`, `TIER_1: 1.0x`, `TIER_2/3: 0.90x`).

| Dimension | Weight | Signal Source |
| :--- | :---: | :--- |
| Code Churn & Complexity | 14% | Added + deleted lines across changed files |
| Critical Path Sensitivity | 18% | Matches against `auth/`, `security/`, `payment/`, `migration/`, `terraform/`, `rbac/` |
| Transitive Blast Radius | 14% | Direct + transitive downstream service count |
| Database Migration Lock & Safety | 18% | SQL lock tier (`NONE`..`CRITICAL`) + destructive ops count |
| Supply Chain & Provenance | 14% | Critical/High CVEs + SLSA verification status |
| Test Confidence Gap | 10% | `1 - predictedCatchProb` from Intelligent Test Selection |
| Infrastructure Drift Exposure | 6% | Active unresolved drift count in target project |
| Historical Service Failure Rate | 6% | Trailing failure rate from `reliability_outcomes` |

## Classification Thresholds
- `LOW`: `< 30`
- `MEDIUM`: `30–54.99`
- `HIGH`: `55–79.99` (or `sqlLockRisk === HIGH`)
- `CRITICAL`: `>= 80` (or `destructiveSqlOpsCount > 0` or `criticalCveCount > 0`)
