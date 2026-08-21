"use client";

import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

interface UsePollingQueryOptions<TData> {
  queryKey: QueryKey;
  queryFn: () => Promise<TData>;
  enabled?: boolean;
  isTerminal: (data: TData | undefined) => boolean;
  intervalMs: number;
  resolveIntervalMs?: (data: TData | undefined) => number;
  /** Keep polling after a failed refetch as long as earlier data is cached. */
  keepPollingOnErrorWithData?: boolean;
}

export function usePollingQuery<TData>({
  queryKey,
  queryFn,
  enabled = true,
  isTerminal,
  intervalMs,
  resolveIntervalMs,
  keepPollingOnErrorWithData = false,
}: UsePollingQueryOptions<TData>): UseQueryResult<TData> {
  return useQuery({
    queryKey,
    queryFn,
    enabled,
    refetchInterval: (query) => {
      const hasData = query.state.data !== undefined;

      if (
        query.state.status === "error" &&
        !(keepPollingOnErrorWithData && hasData)
      ) {
        return false;
      }

      if (isTerminal(query.state.data)) {
        return false;
      }

      return resolveIntervalMs?.(query.state.data) ?? intervalMs;
    },
  } satisfies UseQueryOptions<TData>);
}
