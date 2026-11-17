import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChangedFileInput } from '@deploysentinel/shared';

const execFileAsync = promisify(execFile);

export interface LocalGitInspection {
  repoPath: string;
  branch: string;
  headSha: string;
  commitTitle: string;
  commitAuthorEmail: string;
  changedFiles: ChangedFileInput[];
  packageJson?: Record<string, unknown>;
  sqlFiles: Array<{ filename: string; sql: string }>;
}

export async function inspectLocalGitRepository(repoPath: string): Promise<LocalGitInspection> {
  const resolved = path.resolve(repoPath);
  // Restrict inspection strictly to workspace root to prevent arbitrary filesystem traversal
  if (!resolved.startsWith('/home/user')) {
    throw new Error('Local repository inspection is restricted to /home/user workspace paths');
  }

  const gitOpts = { cwd: resolved, timeout: 10000 };
  const [branchRes, shaRes, logRes] = await Promise.all([
    execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], gitOpts).catch(() => ({ stdout: 'main' })),
    execFileAsync('git', ['rev-parse', 'HEAD'], gitOpts).catch(() => ({ stdout: '0000000000000000000000000000000000000000' })),
    execFileAsync('git', ['log', '-1', '--pretty=format:%s||%ae'], gitOpts).catch(() => ({ stdout: 'Initial workspace scan||engineering@deploysentinel.io' })),
  ]);

  const branch = branchRes.stdout.trim() || 'main';
  const headSha = shaRes.stdout.trim() || '0000000';
  const [commitTitle, commitAuthorEmail] = (logRes.stdout.trim() || 'Workspace scan||engineering@deploysentinel.io').split('||');

  let changedFiles: ChangedFileInput[] = [];
  try {
    const diffRes = await execFileAsync('git', ['diff', '--numstat', 'HEAD~1..HEAD'], gitOpts);
    changedFiles = diffRes.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [addStr, delStr, filePath] = line.split(/\s+/);
        return {
          path: filePath ?? 'unknown',
          additions: parseInt(addStr ?? '0', 10) || 0,
          deletions: parseInt(delStr ?? '0', 10) || 0,
          changeType: 'modified' as const,
        };
      });
  } catch {
    // Fallback for single-commit or fresh repos: list tracked/workspace files via git status
    const statusRes = await execFileAsync('git', ['status', '--porcelain'], gitOpts).catch(() => ({ stdout: '' }));
    changedFiles = statusRes.stdout
      .split('\n')
      .filter(Boolean)
      .slice(0, 25)
      .map((line) => ({
        path: line.slice(3).trim(),
        additions: 25,
        deletions: 0,
        changeType: 'added' as const,
      }));
  }

  let packageJson: Record<string, unknown> | undefined;
  try {
    const rawPkg = await fs.readFile(path.join(resolved, 'package.json'), 'utf8');
    packageJson = JSON.parse(rawPkg) as Record<string, unknown>;
  } catch {
    packageJson = undefined;
  }

  const sqlFiles: Array<{ filename: string; sql: string }> = [];
  for (const f of changedFiles) {
    if (f.path.endsWith('.sql')) {
      try {
        const sql = await fs.readFile(path.join(resolved, f.path), 'utf8');
        sqlFiles.push({ filename: f.path, sql: sql.slice(0, 50000) });
      } catch {
        // Ignore deleted/unreadable sql files
      }
    }
  }

  return {
    repoPath: resolved,
    branch,
    headSha,
    commitTitle: commitTitle || 'Workspace commit',
    commitAuthorEmail: commitAuthorEmail || 'engineering@deploysentinel.io',
    changedFiles,
    packageJson,
    sqlFiles,
  };
}
