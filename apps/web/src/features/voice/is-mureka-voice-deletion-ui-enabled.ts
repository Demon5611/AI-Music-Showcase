"use client";

import { env } from "@/shared/config/env";

/** Self-service Mureka voice deletion UI + API mutation gate. */
export function isMurekaVoiceDeletionUiEnabled(): boolean {
  if (env.appEnv === "production") {
    return false;
  }

  return env.murekaVoiceDeletionEnabled;
}
