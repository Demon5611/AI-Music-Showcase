/**
 * Integration tests for voice profile deletion flow.
 * Requires local Postgres (+ optional Redis for queue remove test).
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/voice-profiles/deletion.integration.test.ts
 */
import "../../common/load-env.js";
import { randomUUID } from "node:crypto";
import { createMurekaVoiceProvider } from "@ai-music/ai-providers";
import { grantCredits, prisma } from "@ai-music/db";
import {
  DEFAULT_MUREKA_VOICE_DELETION_SCOPE,
  MUREKA_CREDIT_COST_UNITS,
} from "@ai-music/shared";
import { loadReadyMurekaVoiceProfile } from "../music/music-generate-mureka.js";
import {
  markProviderDeletionConfirmed,
  markProviderDeletionSubmitted,
  requestDeletionForAllUserVoiceProfiles,
  requestVoiceProfileDeletion,
} from "./deletion.service.js";
import { isAppError } from "../../common/errors.js";

const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];
const createdSampleIds: string[] = [];
const createdRequestIds: string[] = [];

function assertOk(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  ok: ${message}`);
}

async function createUser(): Promise<string> {
  const id = `test_vpd_${randomUUID()}`;
  await prisma.user.create({
    data: { id, email: `${id}@test.local`, name: "Deletion Test" },
  });
  createdUserIds.push(id);
  await grantCredits({
    userId: id,
    amountUnits: MUREKA_CREDIT_COST_UNITS.createPersonalVoice * 2,
    reason: "test_grant",
    idempotencyKey: `test:${id}:grant`,
  });
  return id;
}

async function createReadyProfile(userId: string, externalId: string) {
  const sampleId = randomUUID();
  const profileId = randomUUID();
  await prisma.voiceSample.create({
    data: {
      id: sampleId,
      userId,
      r2Key: "purged",
      durationSec: 20,
      status: "audio_purged",
      consentConfirmed: true,
    },
  });
  createdSampleIds.push(sampleId);

  await prisma.voiceProfile.create({
    data: {
      id: profileId,
      userId,
      provider: "mureka",
      externalId,
      status: "ready",
      sourceVoiceSampleId: sampleId,
    },
  });
  createdProfileIds.push(profileId);
  return profileId;
}

async function cleanup(): Promise<void> {
  if (createdRequestIds.length > 0) {
    await prisma.providerDataDeletionRequest.deleteMany({
      where: { id: { in: createdRequestIds } },
    });
  }
  if (createdProfileIds.length > 0) {
    await prisma.voiceProfile.deleteMany({ where: { id: { in: createdProfileIds } } });
  }
  if (createdSampleIds.length > 0) {
    await prisma.voiceSample.deleteMany({ where: { id: { in: createdSampleIds } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
}

async function ensureSchemaReady(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM voice_profiles LIMIT 1`;
    return true;
  } catch {
    console.log(
      "SKIP deletion.integration.test.ts: voice_profiles table missing — run pnpm db:migrate:deploy",
    );
    return false;
  }
}

async function run(): Promise<void> {
  if (!(await ensureSchemaReady())) {
    return;
  }

  const previousFlag = process.env.MUREKA_VOICE_DELETION_ENABLED;
  process.env.MUREKA_VOICE_DELETION_ENABLED = "true";

  try {
    const userId = await createUser();
    const profileId = await createReadyProfile(userId, `vocal-${randomUUID()}`);

    const first = await requestVoiceProfileDeletion(userId, profileId, {
      systemTriggered: true,
    });
    assertOk(first.profile.status === "deletion_requested", "ready → deletion_requested");

    const second = await requestVoiceProfileDeletion(userId, profileId, {
      systemTriggered: true,
    });
    assertOk(second.messageCode === "deletion_registered", "duplicate user deletion idempotent");

    const request = await prisma.providerDataDeletionRequest.findFirst({
      where: { resourceId: profileId },
    });
    assertOk(Boolean(request), "ProviderDataDeletionRequest persisted");
    if (request) {
      createdRequestIds.push(request.id);
      const metadata = request.metadata as { deletionScope?: typeof DEFAULT_MUREKA_VOICE_DELETION_SCOPE };
      assertOk(Boolean(metadata.deletionScope?.vocalId), "deletionScope saved");
    }

    const generateBlocked = await loadReadyMurekaVoiceProfile(userId, profileId);
    assertOk(generateBlocked === null, "generate blocked after deletion request");

    const mureka = createMurekaVoiceProvider();
    const providerResult = await mureka.requestVoiceProfileDeletion!({
      provider: "mureka",
      externalId: request!.providerExternalId,
      voiceProfileId: profileId,
      deletionScope: DEFAULT_MUREKA_VOICE_DELETION_SCOPE,
    });
    assertOk(providerResult.mode === "manual", "manual provider mode");

    const submittedOnce = await markProviderDeletionSubmitted(request!.id);
    assertOk(submittedOnce.status === "submitted_to_provider", "ops submitted");
    const submittedTwice = await markProviderDeletionSubmitted(request!.id);
    assertOk(
      submittedTwice.submittedAt?.getTime() === submittedOnce.submittedAt?.getTime(),
      "duplicate mark-submitted idempotent",
    );

    const profilePending = await prisma.voiceProfile.findUnique({ where: { id: profileId } });
    assertOk(profilePending?.status === "provider_deletion_pending", "provider_deletion_pending");

    const confirmedOnce = await markProviderDeletionConfirmed(request!.id);
    assertOk(confirmedOnce.status === "confirmed", "ops confirmed");
    const confirmedTwice = await markProviderDeletionConfirmed(request!.id);
    assertOk(
      confirmedTwice.confirmedAt?.getTime() === confirmedOnce.confirmedAt?.getTime(),
      "duplicate mark-confirmed idempotent",
    );

    const profileDeleted = await prisma.voiceProfile.findUnique({ where: { id: profileId } });
    assertOk(profileDeleted?.status === "provider_deleted", "provider_deleted terminal");

    process.env.MUREKA_VOICE_DELETION_ENABLED = "false";
    const user2 = await createUser();
    const profile2 = await createReadyProfile(user2, `vocal-${randomUUID()}`);
    try {
      await requestVoiceProfileDeletion(user2, profile2);
      throw new Error("expected self-service voice deletion to be blocked");
    } catch (error) {
      assertOk(
        isAppError(error) && error.code === "VOICE_DELETION_VIA_ACCOUNT_ONLY",
        "self-service voice deletion only via account deletion",
      );
    }

    const accountResult = await requestDeletionForAllUserVoiceProfiles(user2);
    assertOk(accountResult.processed >= 1, "system account deletion bypasses UI flag");

    const duplicateAccount = await requestDeletionForAllUserVoiceProfiles(user2);
    assertOk(duplicateAccount.processed === 0, "duplicate account deletion no duplicates");

    const noExternalUser = await createUser();
    const creatingProfileId = randomUUID();
    const sampleId = randomUUID();
    await prisma.voiceSample.create({
      data: {
        id: sampleId,
        userId: noExternalUser,
        r2Key: "pending",
        durationSec: 20,
        status: "ready",
        consentConfirmed: true,
      },
    });
    createdSampleIds.push(sampleId);
    await prisma.voiceProfile.create({
      data: {
        id: creatingProfileId,
        userId: noExternalUser,
        provider: "mureka",
        externalId: `pending:${creatingProfileId}`,
        status: "creating",
        sourceVoiceSampleId: sampleId,
      },
    });
    createdProfileIds.push(creatingProfileId);

    await requestVoiceProfileDeletion(noExternalUser, creatingProfileId, {
      systemTriggered: true,
    });
    const noopRequest = await prisma.providerDataDeletionRequest.findFirst({
      where: { resourceId: creatingProfileId },
    });
    assertOk(noopRequest === null, "profile without externalId skips provider ticket");
  } finally {
    process.env.MUREKA_VOICE_DELETION_ENABLED = previousFlag;
    await cleanup();
  }

  console.log("deletion.integration.test.ts: ok");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
