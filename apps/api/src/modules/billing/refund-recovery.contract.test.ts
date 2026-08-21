import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasRefundProviderAttemptMarker } from "@ai-music/shared";
import { evaluateRefundRequeue } from "./refund-enqueue.service.js";
import { reconcileApprovedRefundEnqueues } from "./refund-recovery.service.js";

const here = dirname(fileURLToPath(import.meta.url));
const recoveryService = readFileSync(join(here, "refund-recovery.service.ts"), "utf8");
const loadControlPolling = readFileSync(
  join(here, "../queue/load-control-metrics-polling.ts"),
  "utf8",
);
const ledger = readFileSync(
  join(here, "../../../../../packages/db/src/credits-ledger.ts"),
  "utf8",
);

const approvedBase = {
  status: "approved" as const,
  refundId: "rr-1",
};

function evaluate(input: Partial<Parameters<typeof evaluateRefundRequeue>[0]> = {}) {
  return evaluateRefundRequeue({ ...approvedBase, ...input });
}

describe("refund recovery durable preflight (no reservation)", () => {
  it("1. approved + no provider attempt → requeue eligible without reservation", () => {
    assert.deepEqual(evaluate({ providerReference: null, providerError: null }), { ok: true });
  });

  it("2. approved + waiting job is handled by enqueue layer", () => {
    assert.deepEqual(evaluate(), { ok: true });
  });

  it("4. refunded + BullMQ job removed → not_requeueable", () => {
    const result = evaluate({ status: "refunded" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "STATUS_REFUNDED");
    }
  });

  it("5. needs_review → not_requeueable", () => {
    const result = evaluate({ status: "needs_review" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "STATUS_NEEDS_REVIEW");
    }
  });

  it("6. processing → not_requeueable", () => {
    const result = evaluate({ status: "processing" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "STATUS_PROCESSING");
    }
  });

  it("7. provider attempt marker → not_requeueable", () => {
    for (const providerError of [
      null,
      "awaiting_provider_status:processing",
      "ambiguous_reverse_attempted:timeout",
    ]) {
      const providerReference = providerError ? null : "rr-1";
      const result = evaluate({ providerReference, providerError });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, "PROVIDER_ATTEMPT_EXISTS");
      }
    }
  });

  it("8. admin requeue does not require reservation", () => {
    assert.doesNotMatch(recoveryService, /reservedRefundRequestId/);
    assert.doesNotMatch(recoveryService, /RESERVATION_/);
  });

  it("9. Redis/BullMQ loss: durable DB marker blocks second financial action", () => {
    assert.equal(hasRefundProviderAttemptMarker("rr-1", null), true);
    assert.equal(evaluate({ providerReference: "rr-1", providerError: null }).ok, false);
  });
});

describe("user credits stay spendable during refund workflow", () => {
  it("spend path uses ledger total, not reservedUnitsForUser", () => {
    assert.doesNotMatch(ledger, /reservedUnitsForUser/);
    assert.doesNotMatch(ledger, /spendableBalanceUnits/);
    assert.match(ledger, /balanceUnits < input\.amountUnits/);
  });
});

describe("completed-but-approved impossible state", () => {
  it("successful worker path ends refunded; admin requeue is blocked", () => {
    const terminal = evaluateRefundRequeue({
      status: "refunded",
      refundId: "rr-1",
      providerReference: "rr-1",
      providerError: null,
    });
    assert.equal(terminal.ok, false);
    if (!terminal.ok) {
      assert.equal(terminal.reason, "STATUS_REFUNDED");
    }
  });
});

describe("worker CAS duplicate job contract", () => {
  const flittProcessor = readFileSync(
    join(here, "../../../../../packages/flitt-checkout/src/process-flitt-refund.ts"),
    "utf8",
  );
  const tbcProcessor = readFileSync(
    join(here, "../../../../../packages/tbc-checkout/src/process-tbc-refund.ts"),
    "utf8",
  );

  it("Flitt CAS approved→processing before provider.refund", () => {
    const casIdx = flittProcessor.indexOf('where: { id: row.id, status: "approved" }');
    const refundCallIdx = flittProcessor.indexOf("await provider.refund(");
    assert.ok(casIdx > 0 && refundCallIdx > casIdx);
  });

  it("TBC CAS approved→processing before provider.refund", () => {
    const casIdx = tbcProcessor.indexOf('where: { id: row.id, status: "approved" }');
    const refundCallIdx = tbcProcessor.indexOf("await provider.refund(");
    assert.ok(casIdx > 0 && refundCallIdx > casIdx);
  });
});

describe("automatic recovery sweep", () => {
  it("10. recovery selects approved rows without reservation requirement", () => {
    assert.match(recoveryService, /status: "approved"/);
    assert.match(recoveryService, /providerReference: null/);
    assert.match(recoveryService, /hasRefundProviderAttemptMarker/);
    assert.match(recoveryService, /evaluateRefundRequeue/);
    assert.doesNotMatch(recoveryService, /creditGrantLot/);
    assert.doesNotMatch(recoveryService, /status: "processing"/);
    assert.match(loadControlPolling, /reconcileApprovedRefundEnqueues/);
  });

  it("exports reconcileApprovedRefundEnqueues for periodic tick", () => {
    assert.equal(typeof reconcileApprovedRefundEnqueues, "function");
  });
});
