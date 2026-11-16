# Connector Utilization Report

**Date:** 2026-11-16  

| Connector / Ecosystem | Status in Arena | How Used in ReleaseGuard | Notes / Limitations |
| :--- | :--- | :--- | :--- |
| **Supabase** (`frxweuvcxauwntotmctw`) | Enabled & Healthy | Dedicated `releaseguard` PostgreSQL 17.11 schema (27 tables, RLS enabled, PostgREST exposed) | Zero collision with existing `public` schema tables |
| **Linear** (`Mr.progaming` / `MRP`) | Enabled & Healthy | Created project `ReleaseGuard Enterprise`, 3 milestones (`M1`, `M2`, `M3`), and tracked `[RG-1]`, `[RG-2]`, `[RG-3]` | All build phases synced |
| **Notion** (`prog37396's Space`) | Enabled & Healthy | Created `ReleaseGuard Enterprise` project row & linked PRD/Architecture documentation page | Clean workspace linkage |
| **Vercel** | Enabled (`limited: true`) | Built Vercel deployment adapter (`adapter: 'vercel'`) and connection tester | Token scope limited (`list_teams`/`list_domains`/`list_webhooks` denied); no unauthorized deployments attempted |
| **Google Drive & Dropbox** | Enabled & Healthy | Verified existing state (no duplicate ReleaseGuard files uploaded) | Available for on-demand evidence exports |
| **GitHub, GitLab, Slack, Figma** | `unsupported` in Arena | Implemented native HMAC-SHA256 webhook receiver, Slack/GitHub adapters, and **real local `git` CLI repo scanner** | Runs live on local workspace repos without external Arena connector |
| **Gmail** | **STRICTLY EXCLUDED** | **Never accessed, queried, read, or modified** | Hard user exclusion honored 100% |
