import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["@ai-music/db", "@ai-music/db/**", "@ai-music/storage", "@ai-music/storage/**", "@ai-music/ai-providers/**", "**/apps/worker/**", "**/apps/api/**"], message: "Use browser-safe contracts and the API client." }],
          paths: [
            {
              name: "@ai-music/ai-providers",
              message:
                "Provider logic belongs in API/worker only. Use @ai-music/api-client on web.",
            },
          ],
        },
      ],
      // React Compiler is not enabled; eslint-config-next still ships these as
      // errors. They conflict with hydration sync, Three.js uniforms, and
      // editor playlist refs. Re-enable when adopting the compiler.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
