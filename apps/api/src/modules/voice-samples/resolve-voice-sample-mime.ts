import { ForbiddenError } from "../../common/errors.js";

const ALLOWED_VOICE_SAMPLE_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/flac",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  wav: "audio/wav",
  webm: "audio/webm",
  flac: "audio/flac",
};

function stripMimeParameters(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function extensionFromFilename(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension ?? "";
}

export function resolveVoiceSampleContentType(r2Key: string): string {
  const extension = extensionFromFilename(r2Key);
  return EXTENSION_TO_MIME[extension] ?? "application/octet-stream";
}

export function normalizeVoiceSampleMime(filename: string, mimeType: string): string {
  const baseMime = stripMimeParameters(mimeType);
  const extension = extensionFromFilename(filename);

  if (baseMime === "video/webm" && extension === "webm") {
    return "audio/webm";
  }

  if (ALLOWED_VOICE_SAMPLE_MIMES.has(baseMime)) {
    return baseMime;
  }

  const fromExtension = EXTENSION_TO_MIME[extension];

  if (fromExtension) {
    return fromExtension;
  }

  throw new ForbiddenError("Unsupported audio format");
}
