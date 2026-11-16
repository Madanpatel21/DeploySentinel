# Software Supply Chain Security, SBOM & Readiness Passport

## Supported Standards
- **CycloneDX 1.5** (`bomFormat: "CycloneDX"`) and **SPDX 2.3** (`spdxVersion: "SPDX-2.3"`)
- **CVE Advisory Matching:** Correlates dependency versions against known CVE semver boundaries and flags restricted copyleft/unknown licenses (`GPL-3.0`, `AGPL-3.0`, `SSPL-1.0`).
- **SLSA Provenance & Signature Verification:** Tracks `slsa_level` (0–4) and signature verification state.

## Deployment Readiness Passport
Every ingested release receives a canonical HMAC-SHA256 signature (`rgp_v1.<hex>`) computed over `{ releaseId, organizationId, version, gitSha, riskScore, riskLevel, scoringVersion, sqlLockRisk, cveCount, policyPassed, issuedAt }`. Verification uses `crypto.timingSafeEqual`.
