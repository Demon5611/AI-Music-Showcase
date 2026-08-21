/**
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/features/music-create/utils/music-generation-ui-readiness.test.ts
 */
import assert from "node:assert/strict";
import type { MusicStatusResponseDto } from "@ai-music/shared";
import {
  countPendingSongVariantSlots,
  countPlayableMusicGenerationTracks,
  isMusicGenerationPollTerminal,
  isMusicGenerationTrackPlayable,
  resolveMusicGenerationUiState,
  shouldShowMusicGenerationGlobalLoader,
} from "./music-generation-ui-readiness.js";

function track(
  overrides: Partial<NonNullable<MusicStatusResponseDto["tracks"]>[number]> & {
    id: string;
  },
): NonNullable<MusicStatusResponseDto["tracks"]>[number] {
  return {
    id: overrides.id,
    title: overrides.title ?? "Track",
    audioUrl: overrides.audioUrl ?? "",
    providerTrackId: overrides.providerTrackId ?? overrides.id,
    canDelete: true,
    persistenceState: overrides.persistenceState,
    playbackAvailable: overrides.playbackAvailable,
    audioStatus: overrides.audioStatus,
    durationSec: overrides.durationSec,
    imageUrl: overrides.imageUrl,
    lyricsText: overrides.lyricsText,
  };
}

function status(
  overrides: Partial<MusicStatusResponseDto> & { status: MusicStatusResponseDto["status"] },
): MusicStatusResponseDto {
  return {
    recordId: "rec",
    taskId: "task",
    provider: overrides.provider ?? "sunoapi",
    status: overrides.status,
    tracks: overrides.tracks,
    phaseHint: overrides.phaseHint,
    audioPersistence: overrides.audioPersistence,
    queuePhase: overrides.queuePhase,
    rawStatus: overrides.rawStatus,
  };
}

const playable = track({
  id: "a",
  audioUrl: "/api/music/tracks/a/audio",
  persistenceState: "stored",
  playbackAvailable: true,
  audioStatus: "stored",
});

const processing = track({
  id: "b",
  audioUrl: "",
  persistenceState: "processing",
  playbackAvailable: false,
  audioStatus: "processing",
});

const failedAudio = track({
  id: "c",
  audioUrl: "",
  persistenceState: "failed",
  playbackAvailable: false,
  audioStatus: "failed",
});

// A. provider processing + 0 tracks → global loader
{
  const ui = resolveMusicGenerationUiState({
    status: status({ status: "processing", tracks: [] }),
    isPolling: true,
  });
  assert.equal(ui, "generating");
  assert.equal(shouldShowMusicGenerationGlobalLoader(ui), true);
  assert.equal(isMusicGenerationPollTerminal(status({ status: "processing", tracks: [] })), false);
}

// B. provider completed + 0 persisted tracks → loader still + waiting_for_first_track
{
  const body = status({
    status: "completed",
    tracks: [],
    audioPersistence: "saving",
    phaseHint: "persisting",
  });
  const ui = resolveMusicGenerationUiState({ status: body, isPolling: true });
  assert.equal(ui, "waiting_for_first_track");
  assert.equal(shouldShowMusicGenerationGlobalLoader(ui), true);
  assert.equal(isMusicGenerationPollTerminal(body), false);
}

// C. 1 playable + second processing
{
  const body = status({
    status: "completed",
    tracks: [playable, processing],
    audioPersistence: "saving",
  });
  const ui = resolveMusicGenerationUiState({ status: body, isPolling: true });
  assert.equal(ui, "waiting_for_remaining_tracks");
  assert.equal(shouldShowMusicGenerationGlobalLoader(ui), false);
  assert.equal(countPlayableMusicGenerationTracks(body.tracks), 1);
  assert.deepEqual(countPendingSongVariantSlots({ status: body, isPolling: true }), {
    preparing: 1,
    failed: 0,
  });
  assert.equal(isMusicGenerationPollTerminal(body), false);
}

// D. 2 playable
{
  const second = track({
    id: "d",
    audioUrl: "/api/music/tracks/d/audio",
    persistenceState: "stored",
    playbackAvailable: true,
    audioStatus: "stored",
  });
  const body = status({
    status: "completed",
    tracks: [playable, second],
    audioPersistence: "ready",
  });
  assert.equal(resolveMusicGenerationUiState({ status: body, isPolling: false }), "ready");
  assert.equal(shouldShowMusicGenerationGlobalLoader("ready"), false);
  assert.equal(isMusicGenerationPollTerminal(body), true);
  assert.deepEqual(countPendingSongVariantSlots({ status: body, isPolling: false }), {
    preparing: 0,
    failed: 0,
  });
}

// E. first playable + second terminal failed
{
  const body = status({
    status: "completed",
    tracks: [playable, failedAudio],
    audioPersistence: "failed",
  });
  assert.equal(isMusicGenerationPollTerminal(body), true);
  assert.deepEqual(countPendingSongVariantSlots({ status: body, isPolling: false }), {
    preparing: 0,
    failed: 1,
  });
  assert.equal(shouldShowMusicGenerationGlobalLoader(
    resolveMusicGenerationUiState({ status: body, isPolling: false }),
  ), false);
}

// F. DB row exists but audio processing → not ready
assert.equal(isMusicGenerationTrackPlayable(processing), false);

// G. stored + playbackAvailable → ready
assert.equal(isMusicGenerationTrackPlayable(playable), true);

// H/I. cover / fallback image do not affect playable (no image fields required)
assert.equal(
  isMusicGenerationTrackPlayable(
    track({
      id: "img",
      audioUrl: "/a",
      playbackAvailable: true,
      audioStatus: "stored",
      persistenceState: "stored",
      imageUrl: undefined,
    }),
  ),
  true,
);

// J. 0 tracks + terminal failed
{
  const body = status({ status: "failed", tracks: [] });
  assert.equal(isMusicGenerationPollTerminal(body), true);
  assert.equal(resolveMusicGenerationUiState({ status: body, isPolling: false }), "failed");
  assert.equal(shouldShowMusicGenerationGlobalLoader("failed"), false);
}

// K. completed + 1 playable row + no second row + audioPersistence != saving
// → keep polling; show preparing second (NOT immediate partial failure)
{
  const body = status({
    status: "completed",
    tracks: [playable],
    audioPersistence: "ready",
    phaseHint: "ready",
  });
  assert.equal(isMusicGenerationPollTerminal(body), false);
  assert.equal(
    resolveMusicGenerationUiState({ status: body, isPolling: true }),
    "waiting_for_remaining_tracks",
  );
  assert.deepEqual(countPendingSongVariantSlots({ status: body, isPolling: true }), {
    preparing: 1,
    failed: 0,
  });
}

// L. explicit partial_success marker → terminal; second slot failed
{
  const body = status({
    status: "completed",
    tracks: [playable],
    audioPersistence: "ready",
    rawStatus: "PARTIAL_SUCCESS",
  });
  assert.equal(isMusicGenerationPollTerminal(body), true);
  assert.deepEqual(countPendingSongVariantSlots({ status: body, isPolling: false }), {
    preparing: 0,
    failed: 1,
  });
}

// M. bounded timeout path: poll stopped without second row → failed placeholder
{
  const body = status({
    status: "completed",
    tracks: [playable],
    audioPersistence: "ready",
  });
  assert.deepEqual(countPendingSongVariantSlots({ status: body, isPolling: false }), {
    preparing: 0,
    failed: 1,
  });
}

// N. Mureka default 1 output: completed + 1 playable is terminal (no second slot)
{
  const body = status({
    provider: "mureka",
    status: "completed",
    tracks: [playable],
    audioPersistence: "ready",
    phaseHint: "ready",
  });
  assert.equal(isMusicGenerationPollTerminal(body), true);
  assert.equal(resolveMusicGenerationUiState({ status: body, isPolling: false }), "ready");
  assert.deepEqual(countPendingSongVariantSlots({ status: body, isPolling: false }), {
    preparing: 0,
    failed: 0,
  });
}

console.log("music-generation-ui-readiness.test.ts: ok");
