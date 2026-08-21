export type ContentModerationCategory = "profanity" | "sexual";

export interface ContentBlocklistEntry {
  token: string;
  category: ContentModerationCategory;
}

export const CONTENT_BLOCKLIST_V1: readonly ContentBlocklistEntry[] = [
  { token: "хуй", category: "profanity" },
  { token: "пизд", category: "profanity" },
  { token: "еба", category: "profanity" },
  { token: "бля", category: "profanity" },
  { token: "муд", category: "profanity" },
  { token: "залуп", category: "profanity" },
  { token: "сук", category: "profanity" },
  { token: "шлюх", category: "sexual" },
  { token: "fuck", category: "profanity" },
  { token: "shit", category: "profanity" },
  { token: "bitch", category: "profanity" },
  { token: "cunt", category: "profanity" },
  { token: "dick", category: "sexual" },
  { token: "slut", category: "sexual" },
  { token: "whore", category: "sexual" },
  { token: "porn", category: "sexual" },
  { token: "rape", category: "sexual" },
];
