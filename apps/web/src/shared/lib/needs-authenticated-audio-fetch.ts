export function needsAuthenticatedAudioFetch(src: string): boolean {
  if (!src.includes("/audio")) {
    return false;
  }

  return src.includes("/api/music/") || src.includes("/api/voice-samples/");
}
