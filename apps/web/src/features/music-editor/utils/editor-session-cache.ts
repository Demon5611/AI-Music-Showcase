import type { EditorStateDto } from "@ai-music/shared";

const STORAGE_KEY = "ai-music-editor-state-cache";

function readCache(): Record<string, EditorStateDto> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, EditorStateDto>) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, EditorStateDto>) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export function isEditorStemsReady(state: EditorStateDto): boolean {
  return state.song.status === "ready" && state.stems.length >= 2;
}

export function getCachedEditorState(songId: string): EditorStateDto | null {
  const cached = readCache()[songId];
  return cached && isEditorStemsReady(cached) ? cached : null;
}

export function setCachedEditorState(songId: string, state: EditorStateDto): void {
  if (!isEditorStemsReady(state)) {
    return;
  }

  const cache = readCache();
  cache[songId] = state;
  writeCache(cache);
}

export function clearCachedEditorState(songId: string): void {
  const cache = readCache();

  if (!(songId in cache)) {
    return;
  }

  delete cache[songId];
  writeCache(cache);
}
