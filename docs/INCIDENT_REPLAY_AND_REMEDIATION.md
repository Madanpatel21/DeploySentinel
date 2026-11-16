# Incident Intelligence, Release Replay & Controlled Remediation (L0–L4)

## Release Replay Engine
`GET /api/v1/releases/:id/replay` aggregates chronological evidence across 9 stages:
`commit` → `risk_scoring` → `sql_check` → `sbom_scan` → `policy_gate` → `deployment` → `telemetry` → `incident` → `remediation`.

## Evidence vs Hypotheses Separation
`investigateIncident()` strictly outputs two separate collections:
1. `observedEvidence`: Verified metric spikes, SQL lock flags, drift alerts, and release metadata.
2. `causalHypotheses`: Confidence-ranked inferred explanations referencing observed evidence.

## Controlled Remediation Autonomy Levels
- **L0:** Observe only
- **L1:** Recommend runbook action
- **L2:** Propose action plan with reversibility tag + await human approval
- **L3:** Guarded execution after explicit `APPROVED` status
- **L4:** Policy-authorized execution (production actions still gated by `remediation:approve` + `remediation:execute`)
