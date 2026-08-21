"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { env } from "@/shared/config/env";
import { useAuthUserSync } from "@/shared/hooks/use-auth-user-sync";
import { ClerkApiProvider, DevApiProvider } from "./api-provider";
import { ThemeProvider } from "./theme-provider";

function InnerProviders({ children }: { children: ReactNode }) {
  if (env.isClerkEnabled) {
    return (
      <ClerkApiProvider>
        <AuthUserSyncBoundary>{children}</AuthUserSyncBoundary>
      </ClerkApiProvider>
    );
  }

  return <DevApiProvider>{children}</DevApiProvider>;
}

function AuthUserSyncBoundary({ children }: { children: ReactNode }) {
  useAuthUserSync();
  return children;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  const content = (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <InnerProviders>{children}</InnerProviders>
      </QueryClientProvider>
    </ThemeProvider>
  );

  if (!env.isClerkEnabled) {
    return content;
  }

  return (
    <ClerkProvider publishableKey={env.clerkPublishableKey}>{content}</ClerkProvider>
  );
}
