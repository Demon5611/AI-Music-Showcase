"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { env } from "@/shared/config/env";
import { useClientMounted } from "@/shared/hooks/use-client-mounted";

export interface AuthSession {
  isLoaded: boolean;
  isSignedIn: boolean;
  authReady: boolean;
}

const pendingAuthSession: AuthSession = {
  isLoaded: false,
  isSignedIn: false,
  authReady: false,
};

function useClerkAuthSession(): AuthSession {
  const mounted = useClientMounted();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    if (!mounted || !isLoaded || !isSignedIn) {
      setHasToken(false);
      return;
    }

    let cancelled = false;

    async function resolveToken() {
      const token = await getToken();

      if (!cancelled) {
        setHasToken(Boolean(token));
      }
    }

    void resolveToken();

    return () => {
      cancelled = true;
    };
  }, [mounted, isLoaded, isSignedIn, getToken]);

  if (!mounted) {
    return pendingAuthSession;
  }

  const signedIn = Boolean(isSignedIn);

  return {
    isLoaded,
    isSignedIn: signedIn,
    authReady: isLoaded && signedIn && hasToken,
  };
}

function useDevAuthSession(): AuthSession {
  const mounted = useClientMounted();

  if (!mounted) {
    return pendingAuthSession;
  }

  return {
    isLoaded: true,
    isSignedIn: true,
    authReady: true,
  };
}

const useAuthSessionHook = env.isClerkEnabled ? useClerkAuthSession : useDevAuthSession;

export function useAuthSession(): AuthSession {
  return useAuthSessionHook();
}

export function useAuthReady(): boolean {
  return useAuthSession().authReady;
}
