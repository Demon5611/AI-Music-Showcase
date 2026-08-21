import {
  parseTbcRefundMockScenario,
  type TbcRefundMockScenario,
} from "@ai-music/shared";
import type { TbcPaymentDetails } from "./tbc-client.js";
import { TbcCheckoutError } from "./tbc-errors.js";
import type { TbcRefundInput } from "./tbc-payment-provider.js";
import type { RefundPaymentProvider } from "./refund-payment-provider.js";
import { TBC_PROVIDER_STATUSES } from "./tbc-status.js";

type MockPayState = {
  scenario: TbcRefundMockScenario;
  refundCalls: number;
};

/**
 * Staging/dev-only refund adapter. Never performs HTTP to api.tbcbank.ge.
 * Scenario is derived from fixture providerPaymentId / metadata encoding —
 * never from user-controlled refund request body.
 */
export class MockTbcPaymentProvider implements RefundPaymentProvider {
  /** Always zero — safety criterion for mock smoke. */
  readonly networkCallsToTbcBank = 0;

  refundCalls = 0;
  getPaymentDetailsCalls = 0;

  private readonly state = new Map<string, MockPayState>();

  resetCounters(): void {
    this.refundCalls = 0;
    this.getPaymentDetailsCalls = 0;
    this.state.clear();
  }

  async getPaymentDetails(providerPaymentId: string): Promise<TbcPaymentDetails> {
    this.getPaymentDetailsCalls += 1;
    const payId = providerPaymentId.trim();
    const scenario = this.resolveScenario(payId);
    const entry = this.ensureState(payId, scenario);

    return {
      payId,
      status: this.statusForGet(entry),
      currency: "USD",
      amount: entry.scenario === "partial_returned" ? 10 : 29,
      links: [],
    };
  }

  async refund(input: TbcRefundInput): Promise<{ providerReference: string | null }> {
    this.refundCalls += 1;
    const payId = input.providerPaymentId.trim();
    const scenario = this.resolveScenario(payId);
    const entry = this.ensureState(payId, scenario);
    entry.refundCalls += 1;

    if (scenario === "rejected") {
      throw new TbcCheckoutError("mock_refund_rejected", "provider_4xx", {
        httpStatus: 400,
        code: "TBC_MOCK_REJECTED",
      });
    }

    if (
      scenario === "ambiguous_then_returned" ||
      scenario === "ambiguous_unresolved"
    ) {
      throw new TbcCheckoutError("mock_refund_ambiguous_network", "network", {
        code: "TBC_MOCK_AMBIGUOUS",
      });
    }

    // returned | partial_returned — cancel "succeeds"
    return { providerReference: input.refundRequestId };
  }

  private resolveScenario(payId: string): TbcRefundMockScenario {
    const parsed = parseTbcRefundMockScenario(payId);
    if (!parsed) {
      throw new TbcCheckoutError(
        "mock provider requires tbc-mock:{scenario}:{id} payId",
        "validation",
        { code: "TBC_MOCK_INVALID_PAY_ID" },
      );
    }
    return parsed;
  }

  private ensureState(payId: string, scenario: TbcRefundMockScenario): MockPayState {
    const existing = this.state.get(payId);
    if (existing) {
      return existing;
    }
    const created: MockPayState = { scenario, refundCalls: 0 };
    this.state.set(payId, created);
    return created;
  }

  private statusForGet(entry: MockPayState): string {
    const { scenario, refundCalls } = entry;

    if (scenario === "returned") {
      return refundCalls > 0
        ? TBC_PROVIDER_STATUSES.Returned
        : TBC_PROVIDER_STATUSES.Succeeded;
    }

    if (scenario === "partial_returned") {
      return refundCalls > 0
        ? TBC_PROVIDER_STATUSES.PartialReturned
        : TBC_PROVIDER_STATUSES.Succeeded;
    }

    if (scenario === "rejected") {
      return TBC_PROVIDER_STATUSES.Succeeded;
    }

    if (scenario === "ambiguous_then_returned") {
      return refundCalls > 0
        ? TBC_PROVIDER_STATUSES.Returned
        : TBC_PROVIDER_STATUSES.Succeeded;
    }

    // ambiguous_unresolved: stays Succeeded so reconcile → needs_review
    return TBC_PROVIDER_STATUSES.Succeeded;
  }
}
