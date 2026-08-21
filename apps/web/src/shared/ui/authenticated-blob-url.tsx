"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState, type ReactNode } from "react";
import { createDevAuthToken, env } from "@/shared/config/env";
import { needsAuthenticatedAudioFetch } from "@/shared/lib/needs-authenticated-audio-fetch";

interface AuthenticatedBlobUrlProps {
  src: string | null;
  children: (url: string | null) => ReactNode;
}

function needsAuthenticatedFetch(src: string): boolean {
  return needsAuthenticatedAudioFetch(src);
}

function BlobUrlLoader({
  src,
  getToken,
  children,
}: {
  src: string;
  getToken: () => Promise<string | null>;
  children: (url: string | null) => ReactNode;
}) {
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function loadAudio() {
      const token = await getToken();
      const response = await fetch(src, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error(`Audio request failed: ${response.status}`);
      }

      const blob = await response.blob();
      const contentType = response.headers.get("Content-Type")?.split(";")[0]?.trim();
      const playbackBlob =
        blob.type || !contentType ? blob : new Blob([await blob.arrayBuffer()], { type: contentType });
      objectUrl = URL.createObjectURL(playbackBlob);

      if (!cancelled) {
        setPlaybackUrl(objectUrl);
      }
    }

    void loadAudio().catch(() => {
      if (!cancelled) {
        setPlaybackUrl(null);
      }
    });

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [getToken, src]);

  return children(playbackUrl);
}

function ClerkBlobUrl({ src, children }: AuthenticatedBlobUrlProps) {
  const { getToken } = useAuth();

  if (!src) {
    return children(null);
  }

  if (!needsAuthenticatedFetch(src)) {
    return children(src);
  }

  return (
    <BlobUrlLoader getToken={getToken} src={src}>
      {children}
    </BlobUrlLoader>
  );
}

function DevBlobUrl({ src, children }: AuthenticatedBlobUrlProps) {
  if (!src) {
    return children(null);
  }

  if (!needsAuthenticatedFetch(src)) {
    return children(src);
  }

  return (
    <BlobUrlLoader getToken={async () => createDevAuthToken()} src={src}>
      {children}
    </BlobUrlLoader>
  );
}

export function AuthenticatedBlobUrl(props: AuthenticatedBlobUrlProps) {
  if (env.isClerkEnabled) {
    return <ClerkBlobUrl {...props} />;
  }

  return <DevBlobUrl {...props} />;
}
