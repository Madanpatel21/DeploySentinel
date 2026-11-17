# Compliance Center & Ethical DORA Metrics

## Supported Compliance Frameworks
DeploySentinel maps live approvals, RBAC memberships, SQL migration reviews, SBOM artifacts, and hash-chained audit logs to:
- **SOC 2 Type II** (`CC6.1`, `CC8.1`)
- **ISO 27001** (`A.8.32`)
- **NIST CSF 2.0** (`PR.DS-6`)
- **OWASP ASVS** (`V14.2`)
- **SLSA v1.0** (`SLSA-L3`)
- **GDPR** (`Art. 32`)

Exportable via `GET /api/v1/compliance/export` along with real-time SHA-256 audit chain verification (`GET /api/v1/audit-logs/verify`).

## Ethical DORA Policy
`dora_metrics_daily` and `/api/v1/dora` aggregate Deployment Frequency, Lead Time for Changes, Change Failure Rate, and MTTR exclusively at the **project** and **organization** level (`ethicalGuarantee: "NO_INDIVIDUAL_DEVELOPER_RANKING"`). Individual developer leaderboards or performance scoring are architecturally prohibited.
