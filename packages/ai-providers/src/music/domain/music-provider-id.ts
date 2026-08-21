export const MUSIC_PROVIDER_IDS = [
  "sunoapi",
  "mureka",
  "elevenlabs",
  "official-suno",
  "udio",
  "mock",
] as const;

export type MusicProviderId = (typeof MUSIC_PROVIDER_IDS)[number];

export function isMusicProviderId(value: string): value is MusicProviderId {
  return (MUSIC_PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Resolve default music provider.
 * Prefer MUSIC_DEFAULT_PROVIDER; MUSIC_PROVIDER is a deprecated alias.
 * SHOWCASE_MODE forces the deterministic mock provider.
 */
export function resolveMusicProviderId(
  env: NodeJS.ProcessEnv = process.env,
): MusicProviderId {
  const showcase = (env.SHOWCASE_MODE ?? "").trim().toLowerCase();
  if (showcase === "true" || showcase === "1" || showcase === "yes") {
    return "mock";
  }

  const raw = env.MUSIC_DEFAULT_PROVIDER ?? env.MUSIC_PROVIDER ?? "sunoapi";

  if (!isMusicProviderId(raw)) {
    throw new Error(`Unsupported music provider: ${raw}`);
  }

  return raw;
}

/** Alias for config.music.defaultProvider consumers. */
export const resolveMusicDefaultProvider = resolveMusicProviderId;
