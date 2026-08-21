export type AuthRole = "user" | "admin";

export interface AuthIdentity {
  userId: string;
  email: string;
  name: string | null;
  /** From Clerk publicMetadata.role. Default user. */
  role: AuthRole;
}

export interface AuthVerifier {
  verify(token: string): Promise<AuthIdentity | null>;
}

export function resolveAuthRole(metadata: unknown): AuthRole {
  if (!metadata || typeof metadata !== "object") {
    return "user";
  }

  const role = (metadata as { role?: unknown }).role;
  return role === "admin" ? "admin" : "user";
}
