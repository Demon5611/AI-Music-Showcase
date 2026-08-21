import { ForbiddenError } from "./errors.js";
import { getApiEnv } from "../config/env.js";

export function assertOpsAdmin(request: { headers: Record<string, unknown> }): void {
  const env = getApiEnv();
  const token = env.OPS_ADMIN_TOKEN?.trim();

  if (!token) {
    throw new ForbiddenError("Ops endpoint disabled");
  }

  const header = request.headers["x-ops-token"];

  if (typeof header !== "string" || header !== token) {
    throw new ForbiddenError("Invalid ops token");
  }
}
