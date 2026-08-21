"use client";

/**
 * Sync helper kept for legacy call sites / tests.
 * Prefer {@link usePersonalVoiceCapability} — server SoT via GET /api/music/provider-status.
 *
 * Returns false so production stays fail-closed until capability is loaded from the API.
 */
export function isPersonalVoiceUiAllowed(): boolean {
  return false;
}
