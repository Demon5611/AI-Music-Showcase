import { randomUUID } from "node:crypto";
import { parseLoadMarkers, type FakeScenario } from "./scenarios.js";
import { bumpRun, getTask, noteUniqueTask, saveTask } from "./store.js";

function publicBaseUrl(): string {
  return (
    process.env.FAKE_PUBLIC_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? "4010"}`
  ).replace(/\/$/, "");
}

async function postCallback(url: string, body: unknown, runId: string): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    bumpRun(runId, "callbacksSent");
  } catch {
    // Intentionally ignore — assertions use API/metrics/fake admin counters.
  }
}

function trackPayload(taskId: string, trackId: string, title: string) {
  return {
    id: trackId,
    title,
    audio_url: `${publicBaseUrl()}/audio/${trackId}.mp3`,
    prompt: title,
    tags: "load-test",
    duration: 30,
  };
}

async function scheduleCallbacks(input: {
  taskId: string;
  runId: string;
  scenario: FakeScenario;
  callBackUrl?: string;
  title: string;
  trackId: string;
}): Promise<void> {
  const { taskId, runId, scenario, callBackUrl, title, trackId } = input;
  if (!callBackUrl) {
    return;
  }

  const delayMs = scenario === "delayed" ? 2_000 : 50;
  const dupCount = scenario === "dup_cb" ? 3 : 1;

  setTimeout(() => {
    void (async () => {
      const task = getTask(taskId);
      if (!task) {
        return;
      }

      task.status = "TEXT_SUCCESS";
      await postCallback(
        callBackUrl,
        {
          code: 200,
          msg: "text",
          data: {
            callbackType: "text",
            task_id: taskId,
            data: [trackPayload(taskId, trackId, title)],
          },
        },
        runId,
      );

      task.status = "FIRST_SUCCESS";
      await postCallback(
        callBackUrl,
        {
          code: 200,
          msg: "first",
          data: {
            callbackType: "first",
            task_id: taskId,
            data: [trackPayload(taskId, trackId, title)],
          },
        },
        runId,
      );

      task.status = "SUCCESS";
      const completeBody = {
        code: 200,
        msg: "complete",
        data: {
          callbackType: "complete",
          task_id: taskId,
          data: [trackPayload(taskId, trackId, title)],
        },
      };

      if (scenario === "bad_cb") {
        await postCallback(
          callBackUrl,
          { code: 200, msg: "broken", data: { callbackType: "complete" } },
          runId,
        );
        return;
      }

      for (let i = 0; i < dupCount; i += 1) {
        await postCallback(callBackUrl, completeBody, runId);
      }
    })();
  }, delayMs);
}

export function createTaskFromGenerate(body: Record<string, unknown>): {
  statusCode: number;
  payload: unknown;
} {
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const title = typeof body.title === "string" ? body.title : prompt;
  const { runId, scenario } = parseLoadMarkers(`${prompt} ${title}`);

  bumpRun(runId, "submitRequests", scenario);

  if (scenario === "capacity") {
    return {
      statusCode: 200,
      payload: { code: 430, msg: "capacity", data: null },
    };
  }

  if (scenario === "ambiguous") {
    return {
      statusCode: 200,
      payload: { code: 200, msg: "accepted without taskId", data: {} },
    };
  }

  const taskId = `fake_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const trackId = `trk_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const callBackUrl =
    typeof body.callBackUrl === "string" ? body.callBackUrl : undefined;

  saveTask({
    taskId,
    runId,
    scenario,
    callBackUrl,
    createdAt: Date.now(),
    status: "PENDING",
    trackId,
    audioFailRemaining: scenario === "audio_lag" ? 2 : 0,
  });
  noteUniqueTask(runId);

  void scheduleCallbacks({
    taskId,
    runId,
    scenario,
    callBackUrl,
    title: title || "Load Test Track",
    trackId,
  });

  return {
    statusCode: 200,
    payload: { code: 200, msg: "success", data: { taskId } },
  };
}
