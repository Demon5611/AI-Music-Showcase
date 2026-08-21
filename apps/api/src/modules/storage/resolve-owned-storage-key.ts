import { prisma } from "@ai-music/db";
import {
  buildSongRenderKey,
  buildSongStemKey,
  buildSongWavExportKey,
  type CreateSignedReadUrlInput,
} from "@ai-music/shared";
import { BadRequestError, NotFoundError } from "../../common/errors.js";
import {
  requireSongOwner,
  requireTrackOwner,
  requireVoiceSampleOwner,
} from "../../common/authorization.js";
import { logSecurityEvent } from "../../common/security-log.js";

/**
 * Resolve an owned entity → private storage key. Never trusts a client-supplied key.
 */
export async function resolveOwnedStorageKey(
  userId: string,
  input: CreateSignedReadUrlInput,
): Promise<{ key: string; resourceType: string; resourceId: string }> {
  switch (input.resourceType) {
    case "voice_sample": {
      const sample = await requireVoiceSampleOwner(userId, input.resourceId);
      return {
        key: sample.r2Key,
        resourceType: input.resourceType,
        resourceId: sample.id,
      };
    }
    case "music_track": {
      const track = await requireTrackOwner(userId, input.resourceId);
      const key = track.audioStorageKey?.trim();
      if (!key) {
        throw new NotFoundError("Track audio is not available");
      }
      return { key, resourceType: input.resourceType, resourceId: track.id };
    }
    case "song_audio": {
      const song = await requireSongOwner(userId, input.resourceId);
      const key = song.audioStorageKey?.trim();
      if (!key) {
        throw new NotFoundError("Song audio is not available");
      }
      return { key, resourceType: input.resourceType, resourceId: song.id };
    }
    case "song_stem": {
      await requireSongOwner(userId, input.resourceId);
      const stem = await prisma.songStem.findFirst({
        where: { songId: input.resourceId, type: input.stemType },
        select: { audioStorageKey: true, type: true },
      });
      if (!stem?.audioStorageKey?.trim()) {
        // Fall back to canonical key builder only after song ownership confirmed.
        const key = buildSongStemKey(userId, input.resourceId, input.stemType);
        return { key, resourceType: input.resourceType, resourceId: input.resourceId };
      }
      return {
        key: stem.audioStorageKey,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      };
    }
    case "song_render": {
      await requireSongOwner(userId, input.resourceId);
      const key = buildSongRenderKey(userId, input.resourceId, input.versionNumber);
      return { key, resourceType: input.resourceType, resourceId: input.resourceId };
    }
    case "song_wav": {
      await requireSongOwner(userId, input.resourceId);
      const key = buildSongWavExportKey(userId, input.resourceId, input.versionNumber);
      return { key, resourceType: input.resourceType, resourceId: input.resourceId };
    }
    default: {
      const neverInput: never = input;
      void neverInput;
      logSecurityEvent("authorization_denied", {
        reason: "unknown_signed_url_resource",
        actorUserId: userId,
      });
      throw new BadRequestError("Unsupported storage resource", "UNSUPPORTED_STORAGE_RESOURCE");
    }
  }
}
