import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * Resolve STORAGE_LOCAL_PATH so API and worker share one directory in the monorepo.
 * Relative paths are anchored at the workspace root (pnpm-workspace.yaml), not process.cwd().
 */
export function resolveLocalStoragePath(configuredPath: string | undefined): string {
  const configured = (configuredPath ?? "./storage").trim() || "./storage";

  if (isAbsolute(configured)) {
    return configured;
  }

  const workspaceRoot = findWorkspaceRoot(process.cwd());
  return resolve(workspaceRoot ?? process.cwd(), configured);
}

function findWorkspaceRoot(startDir: string): string | null {
  let current = resolve(startDir);

  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
