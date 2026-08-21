import assert from "node:assert/strict";
import { Registry } from "prom-client";
import { handleMetricsHttpRequest } from "./http-handler.js";
import {
  createMusicMetrics,
  getMusicMetrics,
  sanitizeErrorCode,
} from "./metrics.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// --- getOrCreate / double create ---
const registry = new Registry();
const a = createMusicMetrics(registry);
const b = createMusicMetrics(registry);
assert.equal(a.musicGenerationStartedTotal, b.musicGenerationStartedTotal);
a.musicGenerationStartedTotal.inc();
const text = await registry.metrics();
assert.match(text, /music_generation_started_total/);

// --- error_code allowlist ---
assert.equal(sanitizeErrorCode("TIMEOUT"), "timeout");
assert.equal(sanitizeErrorCode("R2_TRANSIENT"), "storage_transient");
assert.equal(sanitizeErrorCode("HTTP_404"), "provider_4xx");
assert.equal(sanitizeErrorCode("HTTP_503"), "provider_5xx");
assert.equal(sanitizeErrorCode("SSRF_IP"), "ssrf_blocked");
assert.equal(sanitizeErrorCode("some random message!!!"), "unknown");
assert.equal(sanitizeErrorCode("OVERSIZE"), "oversize");

// --- HTTP auth semantics ---
function mockReq(path: string, auth?: string): IncomingMessage {
  return {
    method: "GET",
    url: path,
    headers: auth ? { authorization: auth } : {},
  } as IncomingMessage;
}

function mockRes(): { statusCode: number; body: string; setHeader: () => void; end: (c?: string) => void } {
  const state = { statusCode: 200, body: "" };
  return {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(v: number) {
      state.statusCode = v;
    },
    get body() {
      return state.body;
    },
    setHeader() {},
    end(chunk?: string) {
      state.body = chunk ?? "";
    },
  };
}

{
  const res = mockRes();
  await handleMetricsHttpRequest(mockReq("/metrics"), res as unknown as ServerResponse, {
    enabled: false,
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body, "Not Found");
}

{
  const res = mockRes();
  await handleMetricsHttpRequest(mockReq("/metrics"), res as unknown as ServerResponse, {
    enabled: true,
    bearerToken: "secret",
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body, "Unauthorized");
}

{
  const res = mockRes();
  await handleMetricsHttpRequest(mockReq("/metrics", "Bearer wrong"), res as unknown as ServerResponse, {
    enabled: true,
    bearerToken: "secret",
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body, "Unauthorized");
}

{
  getMusicMetrics().musicGenerationStartedTotal.inc();
  const res = mockRes();
  await handleMetricsHttpRequest(mockReq("/metrics", "Bearer secret"), res as unknown as ServerResponse, {
    enabled: true,
    bearerToken: "secret",
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /music_generation_started_total/);
}

{
  const res = mockRes();
  await handleMetricsHttpRequest(mockReq("/health"), res as unknown as ServerResponse, { enabled: false });
  assert.equal(res.statusCode, 200);
}

{
  const { recordProviderSubmitAttempt, resetMusicMetricsForTests } = await import("./metrics.js");
  const { metricsRegistry } = await import("./registry.js");
  resetMusicMetricsForTests();
  recordProviderSubmitAttempt("submitted");
  recordProviderSubmitAttempt("submit_unknown");
  recordProviderSubmitAttempt("retryable_capacity");
  recordProviderSubmitAttempt("failed");
  const text = await metricsRegistry.metrics();
  assert.match(text, /music_provider_submit_attempts_total/);
  assert.match(text, /result="submitted"/);
  assert.match(text, /result="submit_unknown"/);
  assert.match(text, /result="retryable_capacity"/);
  assert.match(text, /result="failed"/);
}

console.log("observability unit tests passed");
