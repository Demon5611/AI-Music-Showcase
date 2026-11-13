import baseConfig from "./base.mjs";
export default [...baseConfig, { rules: {
  "no-restricted-imports": ["error", { patterns: [{ group: ["@ai-music/web", "@ai-music/web/**", "**/apps/web/**"], message: "Server services must not import web implementation." }] }]
} }];
