import type { FakeScenario } from "./scenarios.js";

export type RunCounters = {
  submitRequests: number;
  uniqueTaskIds: number;
  callbacksSent: number;
  audioRequests: number;
  scenarioCounts: Record<string, number>;
};

type TaskRecord = {
  taskId: string;
  runId: string;
  scenario: FakeScenario;
  callBackUrl?: string;
  createdAt: number;
  status: "PENDING" | "TEXT_SUCCESS" | "FIRST_SUCCESS" | "SUCCESS";
  trackId: string;
  audioFailRemaining: number;
};

const tasks = new Map<string, TaskRecord>();
const runCounters = new Map<string, RunCounters>();

function emptyCounters(): RunCounters {
  return {
    submitRequests: 0,
    uniqueTaskIds: 0,
    callbacksSent: 0,
    audioRequests: 0,
    scenarioCounts: {},
  };
}

export function bumpRun(
  runId: string,
  field: keyof Omit<RunCounters, "scenarioCounts" | "uniqueTaskIds">,
  scenario?: FakeScenario,
): void {
  const row = runCounters.get(runId) ?? emptyCounters();
  row[field] += 1;
  if (scenario) {
    row.scenarioCounts[scenario] = (row.scenarioCounts[scenario] ?? 0) + 1;
  }
  runCounters.set(runId, row);
}

export function noteUniqueTask(runId: string): void {
  const row = runCounters.get(runId) ?? emptyCounters();
  row.uniqueTaskIds += 1;
  runCounters.set(runId, row);
}

export function getRunCounters(runId: string): RunCounters {
  return runCounters.get(runId) ?? emptyCounters();
}

export function saveTask(task: TaskRecord): void {
  tasks.set(task.taskId, task);
}

export function getTask(taskId: string): TaskRecord | undefined {
  return tasks.get(taskId);
}

export function listTasks(): TaskRecord[] {
  return [...tasks.values()];
}
