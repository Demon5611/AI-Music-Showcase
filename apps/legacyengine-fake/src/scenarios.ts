export type FakeScenario =
  | "ok"
  | "delayed"
  | "capacity"
  | "ambiguous"
  | "dup_cb"
  | "bad_cb"
  | "audio_lag";

const SCENARIO_RE = /\bsc=([a-z_]+)\b/i;
const RUN_RE = /\brun=([a-zA-Z0-9_-]+)\b/;

export function parseLoadMarkers(text: string | undefined): {
  runId: string;
  scenario: FakeScenario;
} {
  const source = text ?? "";
  const runMatch = source.match(RUN_RE);
  const scMatch = source.match(SCENARIO_RE);
  const raw = (scMatch?.[1] ?? "ok").toLowerCase();

  const scenario: FakeScenario =
    raw === "delayed" ||
    raw === "capacity" ||
    raw === "ambiguous" ||
    raw === "dup_cb" ||
    raw === "bad_cb" ||
    raw === "audio_lag"
      ? raw
      : "ok";

  return {
    runId: runMatch?.[1] ?? "default",
    scenario,
  };
}
