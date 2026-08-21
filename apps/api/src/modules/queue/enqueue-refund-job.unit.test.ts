import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enqueueRefundJobIdempotent,
  isDuplicateRefundJobIdError,
  type RefundQueueLike,
} from "./enqueue-refund-job.js";

type FakeJob = {
  id: string;
  state: string;
  timestamp: number;
  retryCount: number;
  getState(): Promise<string>;
  retry(): Promise<void>;
};

function createFakeQueue(existing: FakeJob | null = null): RefundQueueLike<{ refundRequestId: string }> & {
  added: number;
  lastJobId?: string;
} {
  let current = existing;
  const queue: RefundQueueLike<{ refundRequestId: string }> & {
    added: number;
    lastJobId?: string;
  } = {
    added: 0,
    async getJob(jobId) {
      return current?.id === jobId ? current : null;
    },
    async add(_name, _payload, opts) {
      const jobId = String(opts.jobId);
      if (current && current.id === jobId) {
        throw new Error(`Job ${jobId} already exists`);
      }
      queue.added += 1;
      queue.lastJobId = jobId;
      current = {
        id: jobId,
        state: "waiting",
        timestamp: Date.now(),
        retryCount: 0,
        getState: async () => current!.state,
        retry: async () => {
          current!.retryCount += 1;
          current!.state = "waiting";
        },
      };
      return { timestamp: current.timestamp };
    },
  };
  return queue;
}

describe("enqueueRefundJobIdempotent", () => {
  it("adds a job when none exists", async () => {
    const queue = createFakeQueue();
    const outcome = await enqueueRefundJobIdempotent({
      queue,
      jobName: "flitt-refund",
      jobId: "flitt-refund-rr-1",
      payload: { refundRequestId: "rr-1" },
      attempts: 5,
      backoffMs: 1000,
    });
    assert.equal(outcome, "queued");
    assert.equal(queue.added, 1);
    assert.equal(queue.lastJobId, "flitt-refund-rr-1");
  });

  it("reuses a waiting job without a second add", async () => {
    const existing: FakeJob = {
      id: "flitt-refund-rr-1",
      state: "waiting",
      timestamp: Date.now() - 1000,
      retryCount: 0,
      getState: async () => existing.state,
      retry: async () => {
        throw new Error("should not retry waiting");
      },
    };
    const queue = createFakeQueue(existing);
    const first = await enqueueRefundJobIdempotent({
      queue,
      jobName: "flitt-refund",
      jobId: "flitt-refund-rr-1",
      payload: { refundRequestId: "rr-1" },
      attempts: 5,
      backoffMs: 1000,
    });
    const second = await enqueueRefundJobIdempotent({
      queue,
      jobName: "flitt-refund",
      jobId: "flitt-refund-rr-1",
      payload: { refundRequestId: "rr-1" },
      attempts: 5,
      backoffMs: 1000,
    });
    assert.equal(first, "already_queued");
    assert.equal(second, "already_queued");
    assert.equal(queue.added, 0);
  });

  it("treats add already-exists as already_queued", async () => {
    const queue = createFakeQueue();
    queue.getJob = async () => null;
    let calls = 0;
    queue.add = async () => {
      calls += 1;
      throw new Error("Job flitt-refund-rr-1 already exists");
    };
    const outcome = await enqueueRefundJobIdempotent({
      queue,
      jobName: "flitt-refund",
      jobId: "flitt-refund-rr-1",
      payload: { refundRequestId: "rr-1" },
      attempts: 5,
      backoffMs: 1000,
    });
    assert.equal(outcome, "already_queued");
    assert.equal(calls, 1);
  });

  it("retries a failed job in place instead of creating a new id", async () => {
    const existing: FakeJob = {
      id: "tbc-refund-rr-1",
      state: "failed",
      timestamp: Date.now() - 1000,
      retryCount: 0,
      getState: async () => existing.state,
      retry: async () => {
        existing.retryCount += 1;
        existing.state = "waiting";
      },
    };
    const queue = createFakeQueue(existing);
    const outcome = await enqueueRefundJobIdempotent({
      queue,
      jobName: "tbc-refund",
      jobId: "tbc-refund-rr-1",
      payload: { refundRequestId: "rr-1" },
      attempts: 5,
      backoffMs: 1000,
    });
    assert.equal(outcome, "queued");
    assert.equal(existing.retryCount, 1);
    assert.equal(queue.added, 0);
  });

  it("does not re-add a completed job", async () => {
    const existing: FakeJob = {
      id: "flitt-refund-rr-1",
      state: "completed",
      timestamp: Date.now() - 1000,
      retryCount: 0,
      getState: async () => "completed",
      retry: async () => {
        throw new Error("should not retry completed");
      },
    };
    const queue = createFakeQueue(existing);
    const outcome = await enqueueRefundJobIdempotent({
      queue,
      jobName: "flitt-refund",
      jobId: "flitt-refund-rr-1",
      payload: { refundRequestId: "rr-1" },
      attempts: 5,
      backoffMs: 1000,
    });
    assert.equal(outcome, "already_queued");
    assert.equal(queue.added, 0);
  });

  it("detects duplicate job id errors", () => {
    assert.equal(isDuplicateRefundJobIdError(new Error("Job x already exists")), true);
    assert.equal(isDuplicateRefundJobIdError(new Error("redis down")), false);
  });
});
