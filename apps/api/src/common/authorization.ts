import { prisma } from "@ai-music/db";
import { ForbiddenError, NotFoundError } from "./errors.js";
import { logSecurityEvent } from "./security-log.js";

/**
 * Shared ownership policies (variant A).
 * Existing service-layer checks remain; new code should prefer these helpers.
 */

export async function requireActiveUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, accountDeletionStatus: true },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.accountDeletionStatus !== "active") {
    logSecurityEvent("authorization_denied", {
      reason: "inactive_user",
      actorUserId: userId,
      accountDeletionStatus: user.accountDeletionStatus,
    });
    throw new ForbiddenError("Account is not active");
  }

  return user;
}

export async function requireTrackOwner(userId: string, trackId: string) {
  const track = await prisma.musicGenerationTrack.findFirst({
    where: { id: trackId, musicGeneration: { userId } },
    select: {
      id: true,
      audioStorageKey: true,
      musicGenerationId: true,
      musicGeneration: { select: { userId: true } },
    },
  });

  if (!track) {
    logSecurityEvent("authorization_denied", {
      reason: "track_ownership",
      actorUserId: userId,
      trackId,
    });
    throw new NotFoundError("Track not found");
  }

  return track;
}

export async function requireVoiceProfileOwner(userId: string, voiceProfileId: string) {
  const profile = await prisma.voiceProfile.findFirst({
    where: { id: voiceProfileId, userId, deletedAt: null },
    select: { id: true, userId: true, provider: true, externalId: true, status: true },
  });

  if (!profile) {
    logSecurityEvent("authorization_denied", {
      reason: "voice_profile_ownership",
      actorUserId: userId,
      voiceProfileId,
    });
    throw new NotFoundError("Voice profile not found");
  }

  return profile;
}

export async function requireVoiceSampleOwner(userId: string, voiceSampleId: string) {
  const sample = await prisma.voiceSample.findFirst({
    where: { id: voiceSampleId, userId },
    select: { id: true, userId: true, r2Key: true },
  });

  if (!sample) {
    logSecurityEvent("authorization_denied", {
      reason: "voice_sample_ownership",
      actorUserId: userId,
      voiceSampleId,
    });
    throw new NotFoundError("Voice sample not found");
  }

  return sample;
}

export async function requireGenerationOwner(userId: string, generationId: string) {
  const generation = await prisma.musicGeneration.findFirst({
    where: { id: generationId, userId },
    select: { id: true, userId: true, status: true },
  });

  if (!generation) {
    logSecurityEvent("authorization_denied", {
      reason: "generation_ownership",
      actorUserId: userId,
      generationId,
    });
    throw new NotFoundError("Generation not found");
  }

  return generation;
}

export async function requireSongOwner(userId: string, songId: string) {
  const song = await prisma.song.findFirst({
    where: { id: songId, userId },
    select: { id: true, userId: true, audioStorageKey: true },
  });

  if (!song) {
    logSecurityEvent("authorization_denied", {
      reason: "song_ownership",
      actorUserId: userId,
      songId,
    });
    throw new NotFoundError("Song not found");
  }

  return song;
}

export async function requirePurchaseOwner(userId: string, paymentId: string) {
  const purchase = await prisma.creditPackPurchase.findFirst({
    where: { id: paymentId, userId },
  });

  if (!purchase) {
    logSecurityEvent("authorization_denied", {
      reason: "purchase_ownership",
      actorUserId: userId,
      paymentId,
    });
    throw new NotFoundError("Purchase not found");
  }

  return purchase;
}
