# DeploySentinel — Security Requirements & Threat Model

**Version:** 1.0.0  
**Last Updated:** 2026-11-16  

---

## 1. Security Architecture Principles

1. **Zero Trust Between Tenants:** Every query, background job, SSE stream, and artifact download validates `organization_id` membership and role permissions.
2. **Deterministic Authority:** AI models cannot approve releases, bypass policy gates, waive CVEs, or trigger destructive infrastructure/database actions.
3. **Untrusted Input Boundary:** Repository diffs, PR descriptions, commit messages, SQL scripts, SBOM manifests, and webhook payloads are treated as untrusted input. Before any text reaches an AI prompt or UI renderer, it is sanitized, stripped of control/instruction-override markers, and length-bounded.
4. **Human-Controlled Destructive Operations:**
   - `auto_rollback_enabled` defaults to `false` on all projects/environments.
   - `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, and lock-heavy `ALTER` statements trigger explicit `BLOCKED` / `MANUAL_APPROVAL_REQUIRED` verdicts.
   - Infrastructure drift remediation generates PR-ready patches only — never auto-applies `terraform apply`.

---

## 2. Threat Model (STRIDE Matrix)

| Threat | Attack Vector | Mitigation in DeploySentinel |
| :--- | :--- | :--- |
| **Spoofing** | Forged CI/GitHub webhooks or stolen JWT | HMAC-SHA256 webhook signature (`timingSafeEqual`) + replay timestamp window; short-lived JWT + revocable refresh sessions + TOTP MFA + bcrypt (`>=12` rounds) |
| **Tampering** | Altering risk scores, approvals, or audit logs | Deterministic server-side re-scoring; hash-chained `audit_logs` (`prev_hash` + `entry_hash`); cryptographic Readiness Passport HMAC signature |
| **Repudiation** | Disputing who approved a risky prod deploy | Immutable audit trail recording actor, IP, user-agent, role, rationale, timestamp, and Separation-of-Duties check (`author_id !== approver_id`) |
| **Info Disclosure** | Cross-tenant leakage or secret exposure | PostgreSQL RLS + API org scoping; secret redaction filter in logs/UI; encrypted connector secrets (`AES-256-GCM`); strict CORS & CSP headers |
| **Denial of Service** | Webhook flood or giant diff/SBOM payload | Payload size caps, sliding-window rate limiting, idempotency keys, and bounded parser complexity |
| **Elevation of Privilege** | Developer approving own prod deploy or calling admin endpoints | 9-role RBAC permission matrix enforced per route + SoD enforcement + no-self-approval rule |
| **Prompt Injection** | Malicious PR body instructing AI explainer to output `"RISK: LOW"` | Deterministic engine computes score independently of AI; AI input wrapped in delimited untrusted blocks with instruction-stripping & strict Zod output validation |

---

## 3. Compliance Controls Mapping

- **SOC 2 Type II:** CC6.1 (RBAC/MFA), CC6.6 (API boundaries), CC7.2 (Anomaly & incident monitoring), CC8.1 (Change management approvals & SoD).
- **ISO 27001:** A.8.9 (Config/Drift), A.8.25 (Secure SDLC), A.8.28 (Secure coding/SAST), A.8.32 (Change management).
- **OWASP ASVS Level 2:** V2 (Auth), V4 (Access Control), V5 (Validation), V7 (Error/Logging), V13 (API).
- **SLSA v1.0 & NIST SSDF:** Build provenance verification, CycloneDX/SPDX SBOM attestation, and non-repudiable release passporting.
