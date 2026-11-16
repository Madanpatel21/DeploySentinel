# Observability, Infrastructure & CI/CD Security Stack

## Containerization & Orchestration
- `infra/Dockerfile.api` & `infra/Dockerfile.web`: Multi-stage Alpine builds running as non-root users (`releaseguard:1001`, `nextjs:1001`) with `HEALTHCHECK`.
- `infra/docker-compose.yml`: Full stack including API, Web, Redis 7, Prometheus, OpenTelemetry Collector, Jaeger, and Grafana.
- `infra/k8s/deployment.yaml`: Non-root Kubernetes Deployment with readiness (`/readyz`) and liveness (`/healthz`) probes.
- `infra/terraform/main.tf`: AWS KMS envelope encryption key + private encrypted S3 archive for SBOM/audit bundles.

## CI/CD & Supply Chain Scanning (`.github/workflows/ci-security.yml`)
- Typecheck, build, and Vitest suite
- **Gitleaks** secret detection
- **Semgrep** TypeScript & OWASP Top 10 SAST
- **Syft** CycloneDX SBOM generation + **Grype** CVE gate
- **Trivy** filesystem & IaC misconfiguration scan
