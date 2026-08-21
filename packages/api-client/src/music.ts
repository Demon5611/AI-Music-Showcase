import type {
  AlbumCoverResponseDto,
  MusicGenerateResponseDto,
  MusicGenerationRecordDto,
  MusicLyricsGenerateResponseDto,
  MusicLyricsStatusResponseDto,
  MusicStatusResponseDto,
  TimedLyricsResponseDto,
} from "@ai-music/shared";
import type { ApiClient } from "./client.js";

export interface GenerateSongBody {
  prompt: string;
  style?: string;
  title?: string;
  mode?: "song" | "instrumental";
  instrumental?: boolean;
  customMode?: boolean;
  durationSec?: number;
  referenceAudioUrl?: string;
  vocalGender?: "m" | "f";
  voiceSampleId?: string;
  voiceProfileId?: string;
  usePersonalVoice?: boolean;
  lyricsLanguage?: string;
  musicBrief?: {
    genre?: string;
    mood?: string;
    tempo?: string;
    instruments?: string[];
    arrangement?: string;
    vocalPresentation?: string;
    vocalRange?: string;
    chorusIntensity?: string;
    additionalInstructions?: string;
  };
  providerOptions?:
    | {
        providerId: "mureka";
        options?: {
          voiceProfileId?: string;
          musicPrompt?: string;
          model?: string;
          n?: number;
        };
      }
    | {
        providerId: "sunoapi";
        options?: {
          customMode?: boolean;
          referenceAudioUrl?: string;
          vocalGender?: "m" | "f";
          personaId?: string;
          personaModel?: "voice_persona" | "style_persona";
        };
      }
    | { providerId: "mock"; options?: Record<string, never> };
}

export interface GenerateLyricsBody {
  prompt: string;
  durationSec?: number;
  lyricsLanguage?: string;
  uiLocale?: string;
}

export interface RemixTrackBody {
  styleId: "pop" | "rock" | "hip-hop" | "electronic" | "r-and-b" | "acoustic";
}

export function createMusicApi(client: ApiClient) {
  return {
    // User readiness (Create UI). Ops-only `/api/music/test/status` stays for curl/runbooks.
    getTestStatus: () =>
      client.get<{
        configured: boolean;
        provider: string;
        personalVoice?: {
          available: boolean;
          reason: string | null;
          productionRolloutEnabled: boolean;
          workerListenReady: boolean;
          workerHeartbeatFresh?: boolean;
        };
      }>("/api/music/provider-status"),
    history: () => client.get<MusicGenerationRecordDto[]>("/api/music/history"),
    generate: (body: GenerateSongBody, idempotencyKey?: string) =>
      client.post<MusicGenerateResponseDto>(
        "/api/music/generate",
        body,
        idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      ),
    generateLyrics: (body: GenerateLyricsBody) =>
      client.post<MusicLyricsGenerateResponseDto>("/api/music/lyrics", body),
    lyricsStatus: (taskId: string, durationSec?: number) => {
      const query =
        durationSec && durationSec > 0
          ? `?durationSec=${encodeURIComponent(String(durationSec))}`
          : "";

      return client.get<MusicLyricsStatusResponseDto>(
        `/api/music/lyrics/status/${encodeURIComponent(taskId)}${query}`,
      );
    },
    status: (taskId: string) => client.get<MusicStatusResponseDto>(`/api/music/status/${taskId}`),
    deleteHistory: (ids: string[]) =>
      client.post<{ deletedCount: number }>("/api/music/history/delete", {
        ids,
      }),
    deleteTrack: (trackId: string) =>
      client.delete<{ deleted: boolean }>(`/api/music/tracks/${trackId}`),
    getTimedLyrics: (trackId: string) =>
      client.get<TimedLyricsResponseDto>(
        `/api/music/tracks/${encodeURIComponent(trackId)}/timed-lyrics`,
      ),
    fetchTimedLyrics: (trackId: string) =>
      client.post<TimedLyricsResponseDto>(
        `/api/music/tracks/${encodeURIComponent(trackId)}/timed-lyrics`,
        {},
      ),
    getAlbumCover: (generationId: string) =>
      client.get<AlbumCoverResponseDto>(
        `/api/music/generations/${encodeURIComponent(generationId)}/album-cover`,
      ),
    fetchAlbumCover: (generationId: string) =>
      client.post<AlbumCoverResponseDto>(
        `/api/music/generations/${encodeURIComponent(generationId)}/album-cover`,
        {},
      ),
    selectAlbumCover: (generationId: string, imageUrl: string) =>
      client.patch<AlbumCoverResponseDto>(
        `/api/music/generations/${encodeURIComponent(generationId)}/album-cover`,
        { imageUrl },
      ),
    remixTrack: (trackId: string, body: RemixTrackBody) =>
      client.post<MusicGenerateResponseDto>(
        `/api/music/tracks/${encodeURIComponent(trackId)}/remix`,
        body,
      ),
  };
}
