"use client";

import { useEffect } from "react";
import { useAuthReady } from "@/shared/hooks/use-auth-ready";
import { useApi } from "@/shared/providers/api-provider";

/** Ensures backend User row exists right after Clerk login via auth plugin fallback. */
export function useAuthUserSync(): void {
  const api = useApi();
  const authReady = useAuthReady();

  useEffect(() => {
    if (!authReady) {
      return;
    }

    void api.users.getMe().catch(() => {
      // Errors surface on protected pages; this hook only triggers sync early.
    });
  }, [api, authReady]);
}
