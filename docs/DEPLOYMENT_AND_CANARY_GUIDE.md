# Deployment Control Center & Canary Statistical Gate

## Supported Adapters
`github`, `gitlab`, `jenkins`, `circleci`, `argocd`, `k8s`, `docker`, `vercel`.

## Canary Statistical Evaluation (`evaluateCanaryTelemetry`)
Compares `baseline` vs `canary` telemetry windows (`errorRate`, `p95LatencyMs`, `rps`, `cpuPct`, `memPct`, `restartCount`) using:
- Two-proportion z-score test on error rates
- Relative latency z-score against baseline `p95` variance
- Pod restart and CPU/memory saturation thresholds

## Safety Invariant: `auto_rollback_enabled = false`
All projects and environments default to `auto_rollback_enabled = false`. When degradation is detected (`DEGRADED` or `CRITICAL`), ReleaseGuard sets `rollback_recommended = true`, broadcasts an SSE alert, and awaits explicit human operator authorization via `POST /api/v1/deployments/:id/rollback`.
