export function buildAudioDownloadFilename(title: string, extension = "mp3"): string {
  const trimmed = title.trim();
  const safeBase =
    trimmed
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "track";

  return `${safeBase}.${extension}`;
}
