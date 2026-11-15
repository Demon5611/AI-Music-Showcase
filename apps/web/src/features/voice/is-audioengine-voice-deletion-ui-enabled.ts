"use client";

import { env } from "@/shared/config/env";

/** Self-service Audioengine voice deletion UI + API mutation gate. */
export function isAudioengineVoiceDeletionUiEnabled(): boolean {
  if (env.appEnv === "production") {
    return false;
  }

  return env.audioengineVoiceDeletionEnabled;
}
