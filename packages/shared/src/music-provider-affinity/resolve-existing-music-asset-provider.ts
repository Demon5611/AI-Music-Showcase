/**
 * Provider Affinity for existing music assets.
 *
 * Creation-time routing (My Voice / MUSIC_DEFAULT_PROVIDER) chooses a vendor for NEW assets.
 * Asset-time routing uses the persisted provider of an EXISTING track/generation/song.
 *
 * Never fall back to MUSIC_DEFAULT_PROVIDER / MUSIC_PROVIDER here.
 */

export const EXISTING_MUSIC_ASSET_PROVIDERS = ["sunoapi", "mureka"] as const;

export type ExistingMusicAssetProviderId = (typeof EXISTING_MUSIC_ASSET_PROVIDERS)[number];

export type MusicProviderAffinityMismatch = {
  ok: false;
  code: "MUSIC_PROVIDER_AFFINITY_MISMATCH";
  trackProvider: string | null;
  generationProvider: string | null;
  songProvider: string | null;
};

export type MusicProviderAffinityUnknown = {
  ok: false;
  code: "MUSIC_PROVIDER_AFFINITY_UNKNOWN";
  trackProvider: string | null;
  generationProvider: string | null;
  songProvider: string | null;
};

export type MusicProviderAffinityResolved = {
  ok: true;
  provider: ExistingMusicAssetProviderId;
  /** Prefer track-level id when present; else generation. */
  providerTaskId: string | null;
  providerTrackId: string | null;
  /** Which persisted field supplied the provider after conflict checks. */
  resolvedFrom: "track" | "generation" | "song";
};

export type MusicProviderAffinityResult =
  | MusicProviderAffinityResolved
  | MusicProviderAffinityMismatch
  | MusicProviderAffinityUnknown;

function normalizeProvider(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isExistingMusicAssetProviderId(value: string): value is ExistingMusicAssetProviderId {
  return (EXISTING_MUSIC_ASSET_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Resolve provider for a post-processing operation on an already-created asset.
 *
 * Precedence when consistent: track.provider → generation.provider → song.provider.
 * Conflict between any non-null sources → MUSIC_PROVIDER_AFFINITY_MISMATCH (fail closed).
 * No known persisted provider → MUSIC_PROVIDER_AFFINITY_UNKNOWN (never default env).
 */
export function resolveExistingMusicAssetProvider(input: {
  trackProvider?: string | null;
  generationProvider?: string | null;
  songProvider?: string | null;
  providerTaskId?: string | null;
  providerTrackId?: string | null;
}): MusicProviderAffinityResult {
  const trackProvider = normalizeProvider(input.trackProvider);
  const generationProvider = normalizeProvider(input.generationProvider);
  const songProvider = normalizeProvider(input.songProvider);

  const present: Array<{ source: "track" | "generation" | "song"; provider: string }> = [];
  if (trackProvider) {
    present.push({ source: "track", provider: trackProvider });
  }
  if (generationProvider) {
    present.push({ source: "generation", provider: generationProvider });
  }
  if (songProvider) {
    present.push({ source: "song", provider: songProvider });
  }

  if (present.length === 0) {
    return {
      ok: false,
      code: "MUSIC_PROVIDER_AFFINITY_UNKNOWN",
      trackProvider,
      generationProvider,
      songProvider,
    };
  }

  const unique = new Set(present.map((item) => item.provider));
  if (unique.size > 1) {
    return {
      ok: false,
      code: "MUSIC_PROVIDER_AFFINITY_MISMATCH",
      trackProvider,
      generationProvider,
      songProvider,
    };
  }

  const provider = present[0]!.provider;
  if (!isExistingMusicAssetProviderId(provider)) {
    return {
      ok: false,
      code: "MUSIC_PROVIDER_AFFINITY_UNKNOWN",
      trackProvider,
      generationProvider,
      songProvider,
    };
  }

  return {
    ok: true,
    provider,
    providerTaskId: normalizeId(input.providerTaskId),
    providerTrackId: normalizeId(input.providerTrackId),
    resolvedFrom: present[0]!.source,
  };
}

/** Safe structured fields for logs (no URLs / secrets). */
export function musicProviderAffinityLogFields(
  result: MusicProviderAffinityResult,
  ids?: { trackId?: string; generationId?: string; songId?: string },
): Record<string, string | null | undefined> {
  return {
    trackId: ids?.trackId,
    generationId: ids?.generationId,
    songId: ids?.songId,
    affinityOk: result.ok ? "true" : "false",
    affinityCode: result.ok ? "OK" : result.code,
    trackProvider: result.ok ? result.provider : result.trackProvider,
    generationProvider: result.ok ? result.provider : result.generationProvider,
    songProvider: result.ok ? result.provider : result.songProvider,
    resolvedFrom: result.ok ? result.resolvedFrom : null,
  };
}
