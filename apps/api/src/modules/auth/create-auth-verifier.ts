import type { AuthVerifier } from "./types.js";
import { createClerkAuthVerifier } from "./clerk-auth.js";
import { createDevAuthVerifier, isDevAuthEnabled } from "./dev-auth.js";

export function createAuthVerifier(): AuthVerifier {
  const verifiers: AuthVerifier[] = [];

  if (isDevAuthEnabled()) {
    verifiers.push(createDevAuthVerifier());
  }

  if (process.env.CLERK_SECRET_KEY) {
    verifiers.push(createClerkAuthVerifier());
  }

  if (verifiers.length === 0) {
    throw new Error(
      "No auth verifier configured. Set CLERK_SECRET_KEY or AUTH_DEV_MODE=true",
    );
  }

  return {
    async verify(token: string) {
      for (const verifier of verifiers) {
        const identity = await verifier.verify(token);

        if (identity) {
          return identity;
        }
      }

      return null;
    },
  };
}
