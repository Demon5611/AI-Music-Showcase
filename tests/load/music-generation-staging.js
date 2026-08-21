/**
 * Staging music-generation load harness (fake Suno via SUNO_MUSIC_API_BASE_URL).
 *
 * Env (never print secrets):
 *   LOAD_API_URL
 *   LOAD_AUTH_TOKENS          comma-separated Clerk JWTs
 *   LOAD_OPS_TOKEN
 *   LOAD_FAKE_ADMIN_URL       e.g. https://fake.example
 *   LOAD_FAKE_ADMIN_TOKEN
 *   LOAD_RUN_ID
 *   LOAD_PROFILE=smoke|baseline|burst
 *   LOAD_MODE=fake            (real forbidden in Actions)
 *   LOAD_VOICE_SAMPLE_ID      optional persona sample
 *   LOAD_RECORD_IDS_FILE      path for RECORD_ID lines (optional)
 *
 * Run:
 *   ./scripts/load/run-music-load.sh smoke
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Trend, Counter } from "k6/metrics";

const apiUrl = (__ENV.LOAD_API_URL || "").replace(/\/$/, "");
const opsToken = __ENV.LOAD_OPS_TOKEN || "";
const fakeAdminUrl = (__ENV.LOAD_FAKE_ADMIN_URL || "").replace(/\/$/, "");
const fakeAdminToken = __ENV.LOAD_FAKE_ADMIN_TOKEN || "";
const runId = __ENV.LOAD_RUN_ID || `run_${Date.now()}`;
const profile = __ENV.LOAD_PROFILE || "smoke";
const mode = __ENV.LOAD_MODE || "fake";
const voiceSampleId = __ENV.LOAD_VOICE_SAMPLE_ID || "";
const recordIdsFile = __ENV.LOAD_RECORD_IDS_FILE || "";

if (mode !== "fake") {
  throw new Error("LOAD_MODE must be fake for this harness (real mode not supported here)");
}

const tokens = new SharedArray("tokens", () =>
  (__ENV.LOAD_AUTH_TOKENS || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
);

if (!apiUrl || tokens.length === 0) {
  throw new Error("LOAD_API_URL and LOAD_AUTH_TOKENS are required");
}

const acceptTrend = new Trend("music_generate_accept_ms", true);
const uniqueOk = new Counter("load_unique_ok");
const idempotentOk = new Counter("load_idempotent_ok");
const conflictOk = new Counter("load_conflict_ok");

function cryptoRandomUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function tokenForVu() {
  return tokens[(__VU - 1) % tokens.length];
}

function marker(scenario) {
  return `[load run=${runId} sc=${scenario}]`;
}

function generateBody(scenario, titleExtra) {
  const mark = marker(scenario);
  return {
    prompt: `${mark} load test lyrics line one\nline two`,
    style: "Pop",
    title: `${mark} ${titleExtra || "Track"}`.slice(0, 80),
    customMode: true,
    instrumental: false,
    durationSec: 30,
    voiceSampleId: voiceSampleId || undefined,
  };
}

function noteRecordId(recordId) {
  if (!recordId || typeof recordId !== "string") {
    return;
  }
  // Machine-parseable; shell wrapper collects into LOAD_RECORD_IDS_FILE.
  // Never log tokens / callback URLs / prompts.
  console.log(`RECORD_ID=${recordId}`);
}

export const options = (() => {
  if (profile === "baseline") {
    return {
      scenarios: {
        baseline: {
          executor: "ramping-vus",
          startVUs: 1,
          stages: [
            { duration: "1m", target: 3 },
            { duration: "3m", target: 5 },
            { duration: "1m", target: 0 },
          ],
        },
      },
      thresholds: {
        http_req_failed: ["rate<0.05"],
        music_generate_accept_ms: ["p(95)<2000"],
      },
    };
  }
  if (profile === "burst") {
    return {
      scenarios: {
        burst: {
          executor: "ramping-vus",
          startVUs: 1,
          stages: [
            { duration: "20s", target: 10 },
            { duration: "40s", target: 10 },
            { duration: "20s", target: 0 },
          ],
        },
      },
      thresholds: {
        http_req_failed: ["rate<0.1"],
      },
    };
  }
  return {
    vus: 2,
    duration: "1m",
    thresholds: {
      http_req_failed: ["rate<0.05"],
      music_generate_accept_ms: ["p(95)<2000"],
    },
  };
})();

export function setup() {
  const me = http.get(`${apiUrl}/api/users/me`, {
    headers: { Authorization: `Bearer ${tokens[0]}` },
  });
  check(me, { "auth ok": (r) => r.status === 200 });
  return { runId };
}

export default function () {
  const token = tokenForVu();
  const scenarioRoll = Math.random();
  let scenario = "ok";
  if (scenarioRoll > 0.92) scenario = "capacity";
  else if (scenarioRoll > 0.88) scenario = "ambiguous";
  else if (scenarioRoll > 0.84) scenario = "audio_lag";
  else if (scenarioRoll > 0.8) scenario = "dup_cb";

  const idem = cryptoRandomUuid();
  const body = JSON.stringify(generateBody(scenario));
  const started = Date.now();
  const res = http.post(`${apiUrl}/api/music/generate`, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idem,
    },
  });
  acceptTrend.add(Date.now() - started);

  const ok = check(res, {
    "generate 2xx": (r) => r.status >= 200 && r.status < 300,
  });
  if (ok) {
    uniqueOk.add(1);
    try {
      const parsed = res.json();
      if (parsed && parsed.recordId) {
        noteRecordId(parsed.recordId);
      }
    } catch (_) {}
  }

  if (__ITER === 0 && __VU === 1) {
    const key = cryptoRandomUuid();
    const sameBody = JSON.stringify(generateBody("ok", "idem-same"));
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    };
    const a = http.post(`${apiUrl}/api/music/generate`, sameBody, { headers });
    const b = http.post(`${apiUrl}/api/music/generate`, sameBody, { headers });
    let sameId = false;
    try {
      sameId = a.json().recordId === b.json().recordId;
      if (a.json().recordId) noteRecordId(a.json().recordId);
    } catch (_) {}
    if (check(null, { "idempotent same record": () => sameId })) {
      idempotentOk.add(1);
    }

    const conflict = http.post(
      `${apiUrl}/api/music/generate`,
      JSON.stringify(generateBody("ok", "idem-diff")),
      { headers },
    );
    if (check(conflict, { "idempotent conflict 409": (r) => r.status === 409 })) {
      conflictOk.add(1);
    }
  }

  sleep(1);
}

export function teardown(data) {
  // Queue depth snapshot (no secrets in stdout beyond status codes).
  if (opsToken) {
    const status = http.get(`${apiUrl}/api/music/ops/status`, {
      headers: { "x-ops-token": opsToken },
    });
    check(status, { "ops status reachable": (r) => r.status === 200 });
  }

  if (fakeAdminUrl && fakeAdminToken && data && data.runId) {
    const counters = http.get(`${fakeAdminUrl}/admin/runs/${data.runId}`, {
      headers: { "x-fake-admin-token": fakeAdminToken },
    });
    check(counters, { "fake admin counters": (r) => r.status === 200 });
  }

  // recordIdsFile is consumed by shell wrapper after parsing RECORD_ID= lines.
  void recordIdsFile;
}

export function handleSummary(data) {
  const summary = {
    profile,
    runId,
    mode,
    thresholds: data.thresholds,
    metrics: {
      http_req_failed: data.metrics.http_req_failed?.values,
      music_generate_accept_ms: data.metrics.music_generate_accept_ms?.values,
      load_unique_ok: data.metrics.load_unique_ok?.values,
      load_idempotent_ok: data.metrics.load_idempotent_ok?.values,
      load_conflict_ok: data.metrics.load_conflict_ok?.values,
    },
  };
  return {
    stdout:
      `\nload summary runId=${runId} profile=${profile}\n` +
      `http_req_failed=${data.metrics.http_req_failed?.values?.rate}\n` +
      `accept_p95=${data.metrics.music_generate_accept_ms?.values?.["p(95)"]}\n`,
    "artifacts/load-tests/last-summary.json": JSON.stringify(summary, null, 2),
  };
}
