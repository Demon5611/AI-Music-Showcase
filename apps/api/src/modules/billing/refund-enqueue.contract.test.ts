import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flittRefundJobId, tbcRefundJobId } from "@ai-music/shared";
import { evaluateRefundRequeue } from "./refund-enqueue.service.js";
import {
  enqueueApprovedRefund,
  enqueueApprovedRefundOrThrow,
} from "./refund.service.js";
import { RefundEnqueueFailedError } from "../../common/errors.js";

const here = dirname(fileURLToPath(import.meta.url));
const refundService = readFileSync(join(here, "refund.service.ts"), "utf8");
const refundRoutes = readFileSync(join(here, "refund.routes.ts"), "utf8");
const flittProcessor = readFileSync(
  join(here, "../../../../../packages/flitt-checkout/src/process-flitt-refund.ts"),
  "utf8",
);
const tbcProcessor = readFileSync(
  join(here, "../../../../../packages/tbc-checkout/src/process-tbc-refund.ts"),
  "utf8",
);

describe("evaluateRefundRequeue", () => {
  it("allows approved without credit reservation", () => {
    assert.deepEqual(
      evaluateRefundRequeue({
        status: "approved",
        refundId: "rr-1",
        providerReference: null,
        providerError: null,
      }),
      { ok: true },
    );
  });

  it("rejects requested", () => {
    assert.equal(
      evaluateRefundRequeue({ status: "requested", refundId: "rr-1" }).ok,
      false,
    );
  });

  it("rejects processing refunded failed and needs_review", () => {
    for (const status of ["processing", "refunded", "failed", "needs_review"]) {
      const result = evaluateRefundRequeue({ status, refundId: "rr-1" });
      assert.equal(result.ok, false);
      if (result.ok === false) {
        assert.equal(result.reason, `STATUS_${status.toUpperCase()}`);
      }
    }
  });

  it("rejects approved rows with durable provider attempt markers", () => {
    assert.equal(
      evaluateRefundRequeue({
        status: "approved",
        refundId: "rr-1",
        providerReference: "rr-1",
        providerError: null,
      }).ok,
      false,
    );
    assert.equal(
      evaluateRefundRequeue({
        status: "approved",
        refundId: "rr-1",
        providerReference: null,
        providerError: "ambiguous_reverse_attempted:timeout",
      }).ok,
      false,
    );
  });
});

describe("enqueueApprovedRefund", () => {
  it("maps queue exceptions to REFUND_ENQUEUE_FAILED without calling provider HTTP", async () => {
    await assert.rejects(
      () =>
        enqueueApprovedRefundOrThrow(
          { id: "rr-1", provider: "flitt" },
          {
            enqueueFlitt: async () => {
              throw new Error("redis_down");
            },
          },
        ),
      (error: unknown) =>
        error instanceof RefundEnqueueFailedError && error.code === "REFUND_ENQUEUE_FAILED",
    );
  });

  it("uses the deterministic job id and does not reserve", async () => {
    assert.equal(flittRefundJobId("rr-1"), "flitt-refund-rr-1");
    assert.equal(tbcRefundJobId("rr-1"), "tbc-refund-rr-1");
    const outcome = await enqueueApprovedRefund(
      { id: "rr-1", provider: "tbc" },
      {
        enqueueTbc: async (payload) => {
          assert.equal(payload.refundRequestId, "rr-1");
          return "already_queued";
        },
      },
    );
    assert.equal(outcome, "already_queued");
    const enqueueFn = refundService.slice(
      refundService.indexOf("export async function enqueueApprovedRefund("),
      refundService.indexOf("export async function enqueueApprovedRefundOrThrow"),
    );
    assert.doesNotMatch(enqueueFn, /reservePurchaseLotForRefund/);
    assert.doesNotMatch(enqueueFn, /evaluateCreditPackRefundApproval/);
  });
});

describe("approve/requeue contracts", () => {
  it("approves without reserving credit lots; enqueue after commit", () => {
    const approveIdx = refundService.indexOf("export async function approveRefundRequest");
    const txEndIdx = refundService.indexOf(
      "const row = await prisma.refundRequest.findUniqueOrThrow",
      approveIdx,
    );
    const enqueueIdx = refundService.indexOf("enqueueApprovedRefundOrThrow", txEndIdx);
    assert.doesNotMatch(
      refundService.slice(approveIdx, txEndIdx),
      /reservePurchaseLotForRefund/,
    );
    assert.ok(enqueueIdx > txEndIdx);
    assert.match(refundService, /RefundEnqueueFailedError/);
  });

  it("exposes admin requeue without reservation or provider HTTP in API", () => {
    assert.match(refundRoutes, /\/api\/admin\/refunds\/:refundId\/requeue/);
    assert.match(refundRoutes, /requireAdmin/);
    assert.match(refundRoutes, /requeueApprovedRefund/);
    const requeueFn = refundService.slice(
      refundService.indexOf("export async function requeueApprovedRefund"),
    );
    assert.doesNotMatch(requeueFn, /reservePurchaseLotForRefund/);
    assert.doesNotMatch(requeueFn, /creditGrantLot/);
    assert.match(requeueFn, /providerReference: row\.providerReference/);
    assert.match(requeueFn, /providerError: row\.providerError/);
    assert.match(requeueFn, /evaluateRefundRequeue/);
    assert.match(flittProcessor, /hasRefundProviderAttemptMarker/);
    assert.match(tbcProcessor, /hasRefundProviderAttemptMarker/);
    assert.match(flittProcessor, /refundRequestId: row.id/);
    assert.match(tbcProcessor, /isCancelAlreadyAttempted/);
  });
});
