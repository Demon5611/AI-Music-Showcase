/**
 * Contract: fake transport responses → submitSunoMusicTaskOnce classifier.
 * Does not change production classifier.
 * Run: pnpm --filter @ai-music/ai-providers exec tsx src/music/providers/suno-api/suno-submit-once.contract.test.ts
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { submitSunoMusicTaskOnce } from "./suno-music-submit-once.js";

async function withServer(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("no port");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function run() {
  await withServer((req, res) => {
    if (req.url === "/api/v1/generate" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 200, msg: "ok", data: {} }));
      return;
    }
    res.writeHead(404);
    res.end();
  }, async (baseUrl) => {
    const result = await submitSunoMusicTaskOnce({
      baseUrl,
      apiKey: "test",
      timeoutMs: 5_000,
      path: "/generate",
      body: { prompt: "x" },
    });
    assert.equal(result.kind, "ambiguous", "200 without taskId → ambiguous");
  });

  await withServer((req, res) => {
    if (req.url === "/api/v1/generate" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 430, msg: "busy", data: null }));
      return;
    }
    res.writeHead(404);
    res.end();
  }, async (baseUrl) => {
    const result = await submitSunoMusicTaskOnce({
      baseUrl,
      apiKey: "test",
      timeoutMs: 5_000,
      path: "/generate",
      body: { prompt: "x" },
    });
    assert.equal(result.kind, "retryable_capacity", "430 → retryable_capacity");
  });

  await withServer((req, res) => {
    if (req.url === "/api/v1/generate" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 200, msg: "ok", data: { taskId: "task_ok_1" } }));
      return;
    }
    res.writeHead(404);
    res.end();
  }, async (baseUrl) => {
    const result = await submitSunoMusicTaskOnce({
      baseUrl,
      apiKey: "test",
      timeoutMs: 5_000,
      path: "/generate",
      body: { prompt: "x" },
    });
    assert.equal(result.kind, "ok");
    if (result.kind === "ok") {
      assert.equal(result.taskId, "task_ok_1");
    }
  });

  console.log("suno-submit-once contract tests passed");
}

void run();
