/**
 * Public showcase / portfolio mode.
 *
 * When enabled, the application prefers deterministic demo adapters and must
 * not call commercial AI or payment providers.
 */
export function isShowcaseMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.SHOWCASE_MODE ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
