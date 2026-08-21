"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { createDevAuthToken, env } from "@/shared/config/env";
import { needsAuthenticatedAudioFetch } from "@/shared/lib/needs-authenticated-audio-fetch";

interface AuthenticatedAudioProps {
  src: string;
  className?: string;
}

function needsAuthenticatedFetch(src: string): boolean {
  return needsAuthenticatedAudioFetch(src);
}

interface AuthenticatedAudioLoaderProps extends AuthenticatedAudioProps {
  getToken: () => Promise<string | null>;
}

function AuthenticatedAudioLoader({
  src,
  className,
  getToken,
}: AuthenticatedAudioLoaderProps) {
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

  if (!playbackUrl) {
    return null;
  }

  return <audio className={className} controls src={playbackUrl} />;
}

function ClerkAuthenticatedAudio({ src, className }: AuthenticatedAudioProps) {
  const { getToken } = useAuth();

  return (
    <AuthenticatedAudioLoader
      className={className}
      getToken={getToken}
      src={src}
    />
  );
}

export function AuthenticatedAudio({ src, className }: AuthenticatedAudioProps) {
  if (!needsAuthenticatedFetch(src)) {
    return <audio className={className} controls src={src} />;
  }

  if (env.isClerkEnabled) {
    return <ClerkAuthenticatedAudio className={className} src={src} />;
  }

  return (
    <AuthenticatedAudioLoader
      className={className}
      getToken={async () => createDevAuthToken()}
      src={src}
    />
  );
}
