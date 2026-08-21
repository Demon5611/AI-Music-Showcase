import type { FastifyBaseLogger } from "fastify";
import { Webhook } from "svix";
import {
  buildInboundWebhookEventId,
  forwardReceivedEmailViaResend,
  hasVisibleInboundRecipients,
  isAllowedInboundRecipient,
  resolveResendInboundFromEnv,
  ResendInboundEnvError,
  ResendSendError,
  shouldIgnoreInboundForLoop,
  type ForwardReceivedEmailResult,
  type ResendInboundEnv,
} from "@ai-music/shared";
import { BadRequestError, AppError } from "../../common/errors.js";
import { runOnceWebhookEvent } from "../webhooks/webhook-event.service.js";

type ResendWebhookPayload = {
  type: string;
  data?: Record<string, unknown>;
};

type ResendInboundLog = Pick<FastifyBaseLogger, "info" | "warn" | "error">;

export type ResendInboundWebhookDeps = {
  resolveConfig?: (env: NodeJS.ProcessEnv) => ResendInboundEnv | null;
  verifyWebhook?: (rawBody: string, headers: Record<string, string>, secret: string) => ResendWebhookPayload;
  runOnce?: typeof runOnceWebhookEvent;
  forwardEmail?: (input: {
    emailId: string;
    config: ResendInboundEnv;
    webhookTo?: string[];
    webhookReceivedFor?: string[];
    webhookFrom?: string;
  }) => Promise<ForwardReceivedEmailResult>;
  env?: NodeJS.ProcessEnv;
};

function readSvixEventId(
  headers: Record<string, string | string[] | undefined>,
): string {
  const svixId = headers["svix-id"];
  const eventId = Array.isArray(svixId) ? svixId[0] : svixId;
  const trimmed = eventId?.trim();

  if (!trimmed) {
    throw new BadRequestError(
      "Missing Resend webhook event id",
      "RESEND_WEBHOOK_EVENT_ID_MISSING",
    );
  }

  return trimmed;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function sanitizeSenderForLog(from: string | undefined): string | undefined {
  if (!from) {
    return undefined;
  }
  const at = from.lastIndexOf("@");
  if (at <= 0) {
    return "unknown";
  }
  return `*@${from.slice(at + 1).replace(/>$/, "").toLowerCase()}`;
}

function defaultVerifyWebhook(
  rawBody: string,
  headers: Record<string, string>,
  secret: string,
): ResendWebhookPayload {
  const wh = new Webhook(secret);
  return wh.verify(rawBody, headers) as ResendWebhookPayload;
}

function resolveConfigOrThrow(
  resolveConfig: (env: NodeJS.ProcessEnv) => ResendInboundEnv | null,
  env: NodeJS.ProcessEnv,
): ResendInboundEnv {
  try {
    const config = resolveConfig(env);
    if (!config) {
      throw new AppError(
        "Resend inbound is not configured",
        503,
        "RESEND_INBOUND_NOT_CONFIGURED",
      );
    }
    return config;
  } catch (error) {
    if (error instanceof ResendInboundEnvError) {
      throw new AppError(error.message, 503, error.code);
    }
    throw error;
  }
}

export async function handleResendInboundWebhook(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  log?: ResendInboundLog,
  deps: ResendInboundWebhookDeps = {},
): Promise<{ received: boolean; processed: boolean; result?: string }> {
  const env = deps.env ?? process.env;
  const resolveConfig = deps.resolveConfig ?? resolveResendInboundFromEnv;
  const config = resolveConfigOrThrow(resolveConfig, env);

  const verifyWebhook = deps.verifyWebhook ?? defaultVerifyWebhook;
  let event: ResendWebhookPayload;

  try {
    event = verifyWebhook(rawBody, headers as Record<string, string>, config.webhookSecret);
  } catch {
    throw new BadRequestError("Invalid Resend webhook signature", "RESEND_WEBHOOK_INVALID");
  }

  const svixId = readSvixEventId(headers);

  if (event.type !== "email.received") {
    log?.info(
      { svixId, eventType: event.type, result: "ignored_event_type" },
      "Resend inbound webhook ignored",
    );
    return { received: true, processed: false, result: "ignored_event_type" };
  }

  const emailId =
    typeof event.data?.email_id === "string" ? event.data.email_id.trim() : "";

  if (!emailId) {
    throw new BadRequestError("Missing email_id", "RESEND_EMAIL_ID_MISSING");
  }

  const webhookFrom = typeof event.data?.from === "string" ? event.data.from : undefined;
  const webhookTo = asStringArray(event.data?.to);
  const webhookReceivedFor = asStringArray(event.data?.received_for);

  log?.info(
    {
      svixId,
      emailId,
      eventType: event.type,
      recipientAlias: config.inboundAddress,
      appEnv: config.appEnv,
      senderDomain: sanitizeSenderForLog(webhookFrom),
    },
    "Resend inbound webhook received",
  );

  // Environment / recipient gate BEFORE WebhookEvent claim and Receiving fetch.
  // Foreign-environment events (dual Resend webhooks) must return 2xx without
  // claiming idempotency keys that would block the owning environment.
  if (
    hasVisibleInboundRecipients({ to: webhookTo, receivedFor: webhookReceivedFor }) &&
    !isAllowedInboundRecipient({
      to: webhookTo,
      receivedFor: webhookReceivedFor,
      inboundAddress: config.inboundAddress,
    })
  ) {
    log?.info(
      {
        emailId,
        result: "ignored_foreign_environment",
        recipientAlias: config.inboundAddress,
        appEnv: config.appEnv,
      },
      "Resend inbound ignored foreign recipient",
    );
    return {
      received: true,
      processed: false,
      result: "ignored_foreign_environment",
    };
  }

  if (
    webhookFrom &&
    shouldIgnoreInboundForLoop({
      from: webhookFrom,
      inboundAddress: config.inboundAddress,
      forwardTo: config.forwardTo,
      fromIdentity: config.fromIdentity,
    })
  ) {
    log?.info(
      {
        emailId,
        result: "ignored_loop",
        recipientAlias: config.inboundAddress,
        appEnv: config.appEnv,
      },
      "Resend inbound ignored loop sender",
    );
    return { received: true, processed: false, result: "ignored_loop" };
  }

  const runOnce = deps.runOnce ?? runOnceWebhookEvent;
  const forwardEmail = deps.forwardEmail ?? forwardReceivedEmailViaResend;

  const once = await runOnce({
    provider: "resend",
    eventId: buildInboundWebhookEventId(emailId),
    type: event.type,
    handler: async () => {
      try {
        const result = await forwardEmail({
          emailId,
          config,
          webhookTo,
          webhookReceivedFor,
          webhookFrom,
        });

        log?.info(
          {
            emailId,
            result: result.status,
            reason: result.status === "ignored" ? result.reason : undefined,
            recipientAlias: config.inboundAddress,
            appEnv: config.appEnv,
          },
          "Resend inbound processed",
        );
      } catch (error) {
        if (error instanceof ResendSendError && !error.retryable) {
          throw new BadRequestError(
            "Resend inbound processing failed",
            "RESEND_INBOUND_FAILED",
          );
        }

        throw new AppError(
          "Resend inbound processing failed",
          502,
          "RESEND_INBOUND_UPSTREAM",
        );
      }
    },
  });

  return {
    received: true,
    processed: once.processed,
    result: once.processed ? "handled" : "duplicate",
  };
}
