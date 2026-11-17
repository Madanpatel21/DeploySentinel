# Connector Responsibility Matrix

| Connector / Service | Arena Connector Status | Role in DeploySentinel | Fallback / Adapter Strategy |
| :--- | :--- | :--- | :--- |
| **Supabase** (`frxweuvcxauwntotmctw`) | Enabled & Healthy | Primary PostgreSQL 17.11 database (`releaseguard` schema + RLS) | Supabase REST + RPC + dedicated schema isolation |
| **Linear** (`MRP` team) | Enabled & Healthy | Project/Milestone/Issue tracking + Incident-to-Linear ticket adapter | Built-in Linear GraphQL client + Arena connector sync |
| **Notion** | Enabled & Healthy | Architecture, PRD, Postmortem & Runbook sync | Notion API adapter + Arena connector sync |
| **Vercel** (`limited: true`) | Enabled (Limited Scope) | Deployment Control Center adapter (preview/prod deployment tracking) | Adapter with explicit token-scope handling; no auto-deploy |
| **Google Drive** | Enabled & Healthy | Optional compliance evidence bundle & export backup | Drive adapter (on-demand export only) |
| **Dropbox** | Enabled & Healthy | Optional archive storage adapter | Dropbox adapter (on-demand export only) |
| **GitHub / GitLab** | Unsupported in Arena | Source PR/commit ingestion, webhook verification, status checks | Built-in HMAC-SHA256 webhook receiver + Octokit/REST client + **real local `git` CLI repo analyzer** |
| **Slack** | Unsupported in Arena | Approval & incident alert notifications | Built-in Slack Incoming Webhook / Block Kit adapter + sandbox event log |
| **Figma** | Unsupported in Arena | Design reference (not required at runtime) | N/A |
| **Gmail** | **STRICTLY EXCLUDED** | **NEVER USED** | **Explicitly prohibited across all code and operations** |
