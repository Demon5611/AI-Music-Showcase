import {
  parseLegacygatewayRefundMockScenario,
  type LegacygatewayRefundMockScenario,
} from "@ai-music/shared";
import type { LegacygatewayPaymentDetails } from "./legacygateway-client.js";
import { LegacygatewayCheckoutError } from "./legacygateway-errors.js";
import type { LegacygatewayRefundInput } from "./legacygateway-payment-provider.js";
import type { RefundPaymentProvider } from "./refund-payment-provider.js";
import { LEGACYGATEWAY_PROVIDER_STATUSES } from "./legacygateway-status.js";

type MockPayState = {
  scenario: LegacygatewayRefundMockScenario;
  refundCalls: number;
};

/**
 * Staging/dev-only refund adapter. Never performs HTTP to api.legacygatewaybank.ge.
 * Scenario is derived from fixture providerPaymentId / metadata encoding —
 * never from user-controlled refund request body.
 */
export class MockLegacygatewayPaymentProvider implements RefundPaymentProvider {
  /** Always zero — safety criterion for mock smoke. */
  readonly networkCallsToLegacygatewayBank = 0;

  refundCalls = 0;
  getPaymentDetailsCalls = 0;

  private readonly state = new Map<string, MockPayState>();

  resetCounters(): void {
    this.refundCalls = 0;
    this.getPaymentDetailsCalls = 0;
    this.state.clear();
  }

  async getPaymentDetails(providerPaymentId: string): Promise<LegacygatewayPaymentDetails> {
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

  async refund(input: LegacygatewayRefundInput): Promise<{ providerReference: string | null }> {
    this.refundCalls += 1;
    const payId = input.providerPaymentId.trim();
    const scenario = this.resolveScenario(payId);
    const entry = this.ensureState(payId, scenario);
    entry.refundCalls += 1;

    if (scenario === "rejected") {
      throw new LegacygatewayCheckoutError("mock_refund_rejected", "provider_4xx", {
        httpStatus: 400,
        code: "LEGACYGATEWAY_MOCK_REJECTED",
      });
    }

    if (
      scenario === "ambiguous_then_returned" ||
      scenario === "ambiguous_unresolved"
    ) {
      throw new LegacygatewayCheckoutError("mock_refund_ambiguous_network", "network", {
        code: "LEGACYGATEWAY_MOCK_AMBIGUOUS",
      });
    }

    // returned | partial_returned — cancel "succeeds"
    return { providerReference: input.refundRequestId };
  }

  private resolveScenario(payId: string): LegacygatewayRefundMockScenario {
    const parsed = parseLegacygatewayRefundMockScenario(payId);
    if (!parsed) {
      throw new LegacygatewayCheckoutError(
        "mock provider requires legacygateway-mock:{scenario}:{id} payId",
        "validation",
        { code: "LEGACYGATEWAY_MOCK_INVALID_PAY_ID" },
      );
    }
    return parsed;
  }

  private ensureState(payId: string, scenario: LegacygatewayRefundMockScenario): MockPayState {
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
        ? LEGACYGATEWAY_PROVIDER_STATUSES.Returned
        : LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded;
    }

    if (scenario === "partial_returned") {
      return refundCalls > 0
        ? LEGACYGATEWAY_PROVIDER_STATUSES.PartialReturned
        : LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded;
    }

    if (scenario === "rejected") {
      return LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded;
    }

    if (scenario === "ambiguous_then_returned") {
      return refundCalls > 0
        ? LEGACYGATEWAY_PROVIDER_STATUSES.Returned
        : LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded;
    }

    // ambiguous_unresolved: stays Succeeded so reconcile → needs_review
    return LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded;
  }
}
