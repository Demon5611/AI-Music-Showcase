import {
  buildPaymentReturnPagePath,
  isPaymentReturnLocale,
  paymentReturnParamsFromRecord,
  readPaymentReturnPurchaseId,
  type PaymentReturnLocale,
} from "@ai-music/shared";
import { NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

function resolveReturnLocale(request: Request, url: URL): PaymentReturnLocale {
  const fromQuery = url.searchParams.get("locale");
  if (fromQuery && isPaymentReturnLocale(fromQuery)) {
    return fromQuery;
  }

  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)NEXT_LOCALE=(en|ru|ka)\b/.exec(cookie);
  if (match?.[1] && isPaymentReturnLocale(match[1])) {
    return match[1];
  }

  return routing.defaultLocale;
}

async function readPurchaseId(request: Request, url: URL): Promise<string | null> {
  const fromQuery = readPaymentReturnPurchaseId(url.searchParams);
  if (fromQuery) {
    return fromQuery;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    return null;
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const json: unknown = await request.json();
      if (json && typeof json === "object" && !Array.isArray(json)) {
        return readPaymentReturnPurchaseId(
          paymentReturnParamsFromRecord(json as Record<string, unknown>),
        );
      }
      return null;
    }

    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const form = await request.formData();
      const record: Record<string, unknown> = {};
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") {
          record[key] = value;
        }
      }
      return readPaymentReturnPurchaseId(paymentReturnParamsFromRecord(record));
    }
  } catch {
    return null;
  }

  return null;
}

async function handlePaymentReturn(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const purchaseId = await readPurchaseId(request, url);
  const locale = resolveReturnLocale(request, url);
  const location = buildPaymentReturnPagePath(locale, purchaseId);
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location },
  });
}

export function GET(request: Request) {
  return handlePaymentReturn(request);
}

export function POST(request: Request) {
  return handlePaymentReturn(request);
}
