# SQL Migration Intelligence & Expand-and-Contract Guide

`packages/engine/src/sql-migration.ts` statically parses SQL DDL/DML migrations and flags production hazards before execution:

| Rule ID | Trigger | Lock / Impact |
| :--- | :--- | :--- |
| `SQL_DESTRUCTIVE_DROP_TABLE` | `DROP TABLE` | `ACCESS EXCLUSIVE` + permanent data loss (`CRITICAL`) |
| `SQL_DESTRUCTIVE_DROP_COLUMN` | `ALTER TABLE ... DROP COLUMN` | `ACCESS EXCLUSIVE` + pod compatibility break (`CRITICAL`) |
| `SQL_DESTRUCTIVE_TRUNCATE` | `TRUNCATE` | `ACCESS EXCLUSIVE` + table wipe (`CRITICAL`) |
| `SQL_TABLE_REWRITE_ALTER_TYPE` | `ALTER COLUMN ... TYPE` | `ACCESS EXCLUSIVE` full table rewrite (`HIGH`) |
| `SQL_ADD_NOT_NULL_NO_DEFAULT` | `ADD COLUMN ... NOT NULL` without `DEFAULT` | Fails on non-empty tables (`HIGH`) |
| `SQL_NON_CONCURRENT_INDEX` | `CREATE INDEX` without `CONCURRENTLY` | `SHARE` lock blocking writes (`MEDIUM`) |
| `SQL_UNBOUNDED_DML` | `DELETE`/`UPDATE` without `WHERE` | Full table row lock & mutation (`CRITICAL`) |

Destructive or high-lock migrations automatically set `requiresManualApproval = true` and output a 4-stage Expand-and-Contract remediation plan plus a best-effort rollback SQL script.
