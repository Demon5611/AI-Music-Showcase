import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createTaskFromGenerate } from "./generate.js";
import { getRunCounters, getTask, listTasks, bumpRun } from "./store.js";
import { TINY_MP3 } from "./tiny-mp3.js";

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

function assertAdmin(req: IncomingMessage): boolean {
  const expected = process.env.FAKE_ADMIN_TOKEN?.trim();
  if (!expected) {
    return false;
  }
  const header = req.headers["x-fake-admin-token"];
  return typeof header === "string" && header === expected;
}

function assertApiKey(req: IncomingMessage): boolean {
  const expected = process.env.SUNO_API_KEY?.trim();
  if (!expected) {
    return true;
  }
  const auth = req.headers.authorization;
  return typeof auth === "string" && auth === `Bearer ${expected}`;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (req.method === "GET" && path.startsWith("/admin/runs/")) {
    if (!assertAdmin(req)) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }
    const runId = decodeURIComponent(path.slice("/admin/runs/".length));
    sendJson(res, 200, getRunCounters(runId));
    return;
  }

  if (req.method === "GET" && path.startsWith("/audio/") && path.endsWith(".mp3")) {
    const trackId = path.slice("/audio/".length, -".mp3".length);
    const task = listTasks().find((item) => item.trackId === trackId);
    if (task) {
      bumpRun(task.runId, "audioRequests");
      if (task.audioFailRemaining > 0) {
        task.audioFailRemaining -= 1;
        sendJson(res, 503, { error: "audio_not_ready" });
        return;
      }
    }
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": TINY_MP3.length,
    });
    res.end(TINY_MP3);
    return;
  }

  if (!assertApiKey(req) && path.startsWith("/api/v1/")) {
    sendJson(res, 401, { code: 401, msg: "unauthorized", data: null });
    return;
  }

  if (
    req.method === "POST" &&
    (path === "/api/v1/generate" || path === "/api/v1/generate/upload-cover")
  ) {
    const body = (await readJson(req)) as Record<string, unknown>;
    const result = createTaskFromGenerate(body);
    sendJson(res, result.statusCode, result.payload);
    return;
  }

  if (req.method === "GET" && path === "/api/v1/generate/record-info") {
    const taskId = url.searchParams.get("taskId")?.trim();
    if (!taskId) {
      sendJson(res, 400, { code: 400, msg: "taskId required", data: null });
      return;
    }
    const task = getTask(taskId);
    if (!task) {
      sendJson(res, 404, { code: 404, msg: "not found", data: null });
      return;
    }
    sendJson(res, 200, {
      code: 200,
      msg: "ok",
      data: {
        taskId,
        status: task.status,
        response: {
          data: [
            {
              id: task.trackId,
              title: "Load Test Track",
              audio_url: `${publicAudioBase()}/audio/${task.trackId}.mp3`,
              duration: 30,
            },
          ],
        },
      },
    });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

function publicAudioBase(): string {
  return (
    process.env.FAKE_PUBLIC_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? "4010"}`
  ).replace(/\/$/, "");
}

export function startFakeSunoServer(port = Number(process.env.PORT ?? 4010)) {
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      sendJson(res, 500, { error: "internal" });
    });
  });

  server.listen(port, "0.0.0.0");
  return server;
}
