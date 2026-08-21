import { Prisma, prisma } from "@ai-music/db";

export type WebhookProvider = "clerk" | "tbc" | "stripe" | "resend";

/**
 * Idempotent webhook processing.
 * `stripe` is historical-only (no Stripe webhook runtime). Production has 0 rows;
 * staging may still have historical Stripe events. Do not delete generic webhook_events.
 * `resend` — inbound email.received forwarding.
 */

export async function runOnceWebhookEvent(input: {
  provider: WebhookProvider;
  eventId: string;
  type: string;
  payloadHash?: string;
  handler: () => Promise<void>;
}): Promise<{ processed: boolean }> {
  const existing = await prisma.webhookEvent.findUnique({
    where: {
      provider_eventId: {
        provider: input.provider,
        eventId: input.eventId,
      },
    },
  });

  if (existing?.status === "succeeded") {
    return { processed: false };
  }

  let eventRecord = existing;

  if (!eventRecord) {
    try {
      eventRecord = await prisma.webhookEvent.create({
        data: {
          provider: input.provider,
          eventId: input.eventId,
          type: input.type,
          payloadHash: input.payloadHash ?? null,
          status: "processing",
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const duplicate = await prisma.webhookEvent.findUnique({
        where: {
          provider_eventId: {
            provider: input.provider,
            eventId: input.eventId,
          },
        },
      });

      if (duplicate?.status === "succeeded") {
        return { processed: false };
      }

      eventRecord = duplicate;
    }
  }

  if (!eventRecord) {
    throw new Error("Webhook event record missing after dedup");
  }

  try {
    await input.handler();

    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: {
        status: "succeeded",
        errorMessage: null,
        processedAt: new Date(),
      },
    });

    return { processed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook handler failed";

    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: {
        status: "failed",
        errorMessage: message,
      },
    });

    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
