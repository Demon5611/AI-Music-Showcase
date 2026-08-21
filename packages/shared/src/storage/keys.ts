export function buildVoiceSampleKey(
  userId: string,
  sampleId: string,
  extension: string,
): string {
  return `voice-samples/${userId}/${sampleId}.${extension}`;
}

export function buildMusicTrackAudioKey(
  userId: string,
  generationId: string,
  trackId: string,
): string {
  return `music-generations/${userId}/${generationId}/${trackId}.mp3`;
}

/** Worker upload path for generation pipeline tracks table. */
export function buildTrackAudioKey(
  userId: string,
  trackId: string,
  extension = "mp3",
): string {
  return `tracks/${userId}/${trackId}.${extension}`;
}

export function buildSongStemKey(
  userId: string,
  songId: string,
  stemType: string,
): string {
  return `songs/${userId}/${songId}/stems/${stemType}.mp3`;
}

export function buildSongRenderKey(
  userId: string,
  songId: string,
  versionNumber: number,
): string {
  return `songs/${userId}/${songId}/renders/v${versionNumber}.mp3`;
}

export function buildSongWavExportKey(
  userId: string,
  songId: string,
  versionNumber: number,
): string {
  return `songs/${userId}/${songId}/exports/v${versionNumber}.wav`;
}
