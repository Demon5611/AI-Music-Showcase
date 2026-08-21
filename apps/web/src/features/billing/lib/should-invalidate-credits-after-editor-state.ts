interface EditorCreditsSnapshot {
  songStatus: string | null;
}

export function shouldInvalidateCreditsAfterEditorStateChange(
  previous: EditorCreditsSnapshot,
  next: EditorCreditsSnapshot,
): boolean {
  if (previous.songStatus === "pending_stems" && next.songStatus === "separating_stems") {
    return true;
  }

  if (previous.songStatus === "separating_stems" && next.songStatus === "ready") {
    return true;
  }

  return false;
}
