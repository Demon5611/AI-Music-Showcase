import { prisma } from "@ai-music/db";
import { uploadVoiceSampleFieldsSchema } from "@ai-music/shared";
import { ForbiddenError, NotFoundError } from "../../common/errors.js";
import {
  buildVoiceSampleKey,
  getStorageService,
  resolveVoiceSampleExtension,
} from "../storage/storage.service.js";
import { toVoiceSampleDto, toVoiceSampleDtoWithPersonaCheck } from "./mapper.js";
import { normalizeVoiceSampleMime, resolveVoiceSampleContentType } from "./resolve-voice-sample-mime.js";
import { resolvePersonaVoiceId } from "./persona-voice-id.service.js";
import { syncVoiceSampleListEntry } from "./suno-voice.service.js";

export interface CreateVoiceSampleInput {
  userId: string;
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
  fields: Record<string, string>;
}

export async function listVoiceSamples(userId: string) {
  const samples = await prisma.voiceSample.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const synced = await Promise.all(samples.map((sample) => syncVoiceSampleListEntry(sample)));

  return Promise.all(
    synced.map((sample) => toVoiceSampleDtoWithPersonaCheck(sample, resolvePersonaVoiceId)),
  );
}

export async function deleteVoiceSample(userId: string, sampleId: string) {
  const sample = await prisma.voiceSample.findFirst({
    where: { id: sampleId, userId },
  });

  if (!sample) {
    throw new NotFoundError("Voice sample not found");
  }

  await getStorageService().delete(sample.r2Key);
  await prisma.voiceSample.delete({ where: { id: sample.id } });
}

async function deleteAllUserVoiceSamples(userId: string) {
  const samples = await prisma.voiceSample.findMany({
    where: { userId },
    select: { id: true, r2Key: true },
  });

  if (samples.length === 0) {
    return;
  }

  const storage = getStorageService();

  await Promise.all(
    samples.map((sample) => {
      if (sample.r2Key === "pending") {
        return Promise.resolve();
      }

      return storage.delete(sample.r2Key).catch(() => undefined);
    }),
  );

  await prisma.voiceSample.deleteMany({ where: { userId } });
}

export async function createVoiceSample(input: CreateVoiceSampleInput) {
  const parsedFields = uploadVoiceSampleFieldsSchema.safeParse({
    confirmed: input.fields.confirmed === "true",
    voiceLanguage: input.fields.voiceLanguage,
    consentPhrase: input.fields.consentPhrase,
    durationSec: input.fields.durationSec,
  });

  if (!parsedFields.success) {
    throw new ForbiddenError("Voice consent is required");
  }

  await deleteAllUserVoiceSamples(input.userId);

  const mimeType = normalizeVoiceSampleMime(input.filename, input.mimeType);

  const sample = await prisma.voiceSample.create({
    data: {
      userId: input.userId,
      r2Key: "pending",
      durationSec: parsedFields.data.durationSec,
      status: "pending",
      consentConfirmed: true,
      voiceLanguage: parsedFields.data.voiceLanguage,
    },
  });

  const extension = resolveVoiceSampleExtension(input.filename, mimeType);
  const storageKey = buildVoiceSampleKey(input.userId, sample.id, extension);
  const storage = getStorageService();

  try {
    await storage.putObject({
      key: storageKey,
      body: input.fileBuffer,
      contentType: mimeType,
      kind: "voice_sample",
      userId: input.userId,
      entityType: "voice_sample",
      entityId: sample.id,
      visibility: "private",
    });

    const updated = await prisma.voiceSample.update({
      where: { id: sample.id },
      data: { r2Key: storageKey, status: "ready" },
    });

    return toVoiceSampleDto(updated);
  } catch (error) {
    await storage.deleteObject(storageKey).catch(() => undefined);
    await prisma.voiceSample.delete({ where: { id: sample.id } }).catch(() => undefined);
    throw error;
  }
}

export async function getVoiceSampleAudio(userId: string, sampleId: string) {
  const sample = await prisma.voiceSample.findFirst({
    where: { id: sampleId, userId },
  });

  if (!sample) {
    throw new NotFoundError("Voice sample not found");
  }

  if (sample.r2Key === "pending") {
    throw new NotFoundError("Voice sample audio is not stored yet");
  }

  const buffer = await getStorageService().get(sample.r2Key);

  return {
    buffer,
    contentType: resolveVoiceSampleContentType(sample.r2Key),
  };
}
