export function stripPersonaConflictingStyleTags(style: string | undefined): string | undefined {
  const trimmedStyle = style?.trim();

  if (!trimmedStyle) {
    return trimmedStyle;
  }

  const filtered = trimmedStyle
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/\bvocal\b/i.test(part));

  return filtered.length > 0 ? filtered.join(", ") : trimmedStyle;
}
