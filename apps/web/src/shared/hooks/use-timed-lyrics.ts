"use client";

import { ApiError } from "@ai-music/api-client";
import type { TimedLyricsResponseDto } from "@ai-music/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/shared/providers/api-provider";
import { useInvalidateCreditsBalance } from "@/features/billing/hooks/invalidate-credits-balance";

export const timedLyricsQueryKey = (trackId: string) => ["timed-lyrics", "v2", trackId] as const;

export type TimedLyricsCacheResult =
  | { kind: "cached"; data: TimedLyricsResponseDto }
  | { kind: "miss" }
  | { kind: "unavailable"; code: string; message?: string };

function getApiErrorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) {
    return error.status;
  }

  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }

  return undefined;
}

function getApiErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") {
    return undefined;
  }

  const code = (error.body as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function getApiErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") {
    return undefined;
  }

  const message = (error.body as { error?: unknown }).error;
  return typeof message === "string" ? message : undefined;
}

const UNAVAILABLE_CODES = new Set([
  "TIMED_LYRICS_UNAVAILABLE_FOR_PROVIDER",
  "TIMED_LYRICS_PROVIDER_IDS_MISSING",
  "MUSIC_PROVIDER_AFFINITY_MISMATCH",
  "MUSIC_PROVIDER_AFFINITY_UNKNOWN",
  "TIMED_LYRICS_NO_LYRICS",
  "TIMED_LYRICS_INSTRUMENTAL",
  "TIMED_LYRICS_NOT_SONG",
]);

/**
 * Cache-only timed lyrics. Never POSTs / spends credits.
 * 404 → miss. Capability/eligibility 400 → unavailable. No automatic retries.
 */
export function useTimedLyricsCache(
  trackId: string | undefined,
  enabled: boolean,
) {
  const api = useApi();

  return useQuery({
    queryKey: trackId ? timedLyricsQueryKey(trackId) : ["timed-lyrics", "missing"],
    enabled: Boolean(trackId && enabled),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<TimedLyricsCacheResult> => {
      if (!trackId) {
        throw new Error("Track id is required");
      }

      try {
        const cached = await api.music.getTimedLyrics(trackId);
        return { kind: "cached", data: cached };
      } catch (error) {
        const status = getApiErrorStatus(error);
        const code = getApiErrorCode(error) ?? "BAD_REQUEST";

        if (status === 404) {
          return { kind: "miss" };
        }

        if (status === 400 || UNAVAILABLE_CODES.has(code)) {
          return {
            kind: "unavailable",
            code,
            message: getApiErrorMessage(error),
          };
        }

        throw error;
      }
    },
  });
}

/** Explicit user-initiated Karaoke Sync (may spend 1 credit on cache miss). */
export function useFetchTimedLyricsMutation(trackId: string | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  const invalidateCreditsBalance = useInvalidateCreditsBalance();

  return useMutation({
    mutationFn: async () => {
      if (!trackId) {
        throw new Error("Track id is required");
      }

      return api.music.fetchTimedLyrics(trackId);
    },
    onSuccess: async (data) => {
      if (!trackId) {
        return;
      }

      queryClient.setQueryData(timedLyricsQueryKey(trackId), {
        kind: "cached",
        data,
      } satisfies TimedLyricsCacheResult);

      if (!data.cached) {
        await invalidateCreditsBalance();
      }
    },
  });
}

/** @deprecated Prefer useTimedLyricsCache + useFetchTimedLyricsMutation */
export function useTimedLyrics(trackId: string | undefined, karaokeEnabled: boolean) {
  return useTimedLyricsCache(trackId, karaokeEnabled);
}
