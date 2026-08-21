import type { VoiceProfile } from "@ai-music/db";
import { prisma } from "@ai-music/db";
import {
  buildMurekaVoiceProfileRefundKey,
  isVoiceProfileStatus,
  type VoiceProfileDto,
  type VoiceProfileStatus,
} from "@ai-music/shared";

function resolveStatus(status: string): VoiceProfileStatus {
  return isVoiceProfileStatus(status) ? status : "failed";
}

export async function toVoiceProfileDto(profile: VoiceProfile): Promise<VoiceProfileDto> {
  const refundConfirmed =
    profile.status === "failed"
      ? Boolean(
          await prisma.creditTransaction.findUnique({
            where: {
              idempotencyKey: buildMurekaVoiceProfileRefundKey(profile.id),
            },
            select: { id: true },
          }),
        )
      : false;

  return {
    id: profile.id,
    status: resolveStatus(profile.status),
    provider: profile.provider,
    sourceVoiceSampleId: profile.sourceVoiceSampleId,
    refundConfirmed,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export type VoiceProfileDeletionResponse = {
  profile: VoiceProfileDto;
  /** User-facing copy key hint — never claims provider already deleted data. */
  messageCode: "deletion_registered";
};
