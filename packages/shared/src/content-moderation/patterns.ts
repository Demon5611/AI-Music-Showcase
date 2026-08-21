import type { ContentModerationCategory } from "./blocklist.v1.js";

export interface ContentModerationPattern {
  category: ContentModerationCategory;
  regex: RegExp;
}

export const CONTENT_MODERATION_PATTERNS: readonly ContentModerationPattern[] = [
  {
    category: "profanity",
    regex: /[xх][\s\p{P}\p{S}_]*[uуy@][\s\p{P}\p{S}_]*([йиi1!])/giu,
  },
  {
    category: "profanity",
    regex: /[бb6][\s\p{P}\p{S}_]*[лl1!][\s\p{P}\p{S}_]*([яya@])/giu,
  },
  {
    category: "profanity",
    regex: /f[\s\p{P}\p{S}_]*u[\s\p{P}\p{S}_]*c[\s\p{P}\p{S}_]*k/giu,
  },
  {
    category: "profanity",
    regex: /s[\s\p{P}\p{S}_]*h[\s\p{P}\p{S}_]*i[\s\p{P}\p{S}_]*t/giu,
  },
  {
    category: "sexual",
    regex: /p[\s\p{P}\p{S}_]*o[\s\p{P}\p{S}_]*r[\s\p{P}\p{S}_]*n/giu,
  },
];
