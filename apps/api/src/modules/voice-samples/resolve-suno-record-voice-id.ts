/** Persona id from record-info — only non-empty voiceId, never taskId. */
export function resolveSunoRecordVoiceId(recordInfo: {
  status: string;
  voiceId?: string | null;
}): string | null {
  if (String(recordInfo.status) !== "success") {
    return null;
  }

  const voiceId = recordInfo.voiceId?.trim();
  return voiceId || null;
}
