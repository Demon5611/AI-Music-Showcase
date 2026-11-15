import nodeConfig from "@ai-music/config/eslint/node";
export default [...nodeConfig, { rules: {
  "no-restricted-imports": ["error", { patterns: [{ group: ["**/apps/**", "@ai-music/db", "@ai-music/db/**", "@ai-music/ai-providers", "@ai-music/ai-providers/**", "@ai-music/storage", "@ai-music/storage/**"], message: "Shared contracts must not depend on application implementations." }] }]
} }];
