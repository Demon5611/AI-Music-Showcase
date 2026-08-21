export const MUSIC_CREATE_LYRICS_BRIEF_DRAFT_KEY = "music-create:lyrics-brief-draft";
export const MUSIC_CREATE_LYRICS_BRIEF_MAX_LENGTH = 200;

/** @deprecated use MUSIC_CREATE_LYRICS_BRIEF_* — kept for migration */
export const MUSIC_CREATE_PROMPT_DRAFT_KEY = MUSIC_CREATE_LYRICS_BRIEF_DRAFT_KEY;
/** @deprecated use MUSIC_CREATE_LYRICS_BRIEF_MAX_LENGTH */
export const MUSIC_CREATE_PROMPT_MAX_LENGTH = MUSIC_CREATE_LYRICS_BRIEF_MAX_LENGTH;

export function saveMusicCreateLyricsBriefDraft(brief: string) {
  if (typeof window === "undefined") {
    return;
  }

  const trimmed = brief.trim().slice(0, MUSIC_CREATE_LYRICS_BRIEF_MAX_LENGTH);
  if (!trimmed) {
    return;
  }

  sessionStorage.setItem(MUSIC_CREATE_LYRICS_BRIEF_DRAFT_KEY, trimmed);
}

export function consumeMusicCreateLyricsBriefDraft(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const draft = sessionStorage.getItem(MUSIC_CREATE_LYRICS_BRIEF_DRAFT_KEY);
  if (!draft) {
    return null;
  }

  sessionStorage.removeItem(MUSIC_CREATE_LYRICS_BRIEF_DRAFT_KEY);
  return draft;
}

/** @deprecated use saveMusicCreateLyricsBriefDraft */
export const saveMusicCreatePromptDraft = saveMusicCreateLyricsBriefDraft;

/** @deprecated use consumeMusicCreateLyricsBriefDraft */
export const consumeMusicCreatePromptDraft = consumeMusicCreateLyricsBriefDraft;
