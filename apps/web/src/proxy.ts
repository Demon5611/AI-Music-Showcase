import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  isLegacyPricingReturnPath,
  isLocalePaymentReturnPath,
  isPaymentReturnApiPath,
  isPaymentReturnLocale,
  readPaymentReturnPurchaseId,
} from "@ai-music/shared";
import createMiddleware from "next-intl/middleware";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { env } from "@/shared/config/env";
import { routing } from "@/i18n/routing";
import { redirectToPaymentReturnPage } from "@/shared/lib/payment-return-redirect";

const handleI18nRouting = createMiddleware(routing);

const clerkHandler = clerkMiddleware(async (_auth, request) => handleI18nRouting(request));

function localeFromPathname(pathname: string): "en" | "ru" | "ka" | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment && isPaymentReturnLocale(segment) ? segment : null;
}

/**
 * Flitt browser return is HTTPS POST or GET (official payment flow).
 * POST to a Clerk-wrapped GET page was sent to clerk.accounts.dev → HTTP 405.
 * Convert return POSTs to GET before Clerk/i18n. Do not read the POST body
 * as payment proof — only purchaseId/order_id already on the query string.
 */
function redirectFlittBrowserReturn(request: NextRequest): NextResponse | null {
  if (isPaymentReturnApiPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (request.method !== "POST") {
    return null;
  }

  const pathname = request.nextUrl.pathname;
  const locale = localeFromPathname(pathname);
  if (!locale) {
    return null;
  }

  if (!isLocalePaymentReturnPath(pathname) && !isLegacyPricingReturnPath(pathname)) {
    return null;
  }

  const purchaseId = readPaymentReturnPurchaseId(request.nextUrl.searchParams);
  return redirectToPaymentReturnPage(request, locale, purchaseId);
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const converted = redirectFlittBrowserReturn(request);
  if (converted) {
    return converted;
  }

  if (env.isClerkEnabled) {
    return clerkHandler(request, event);
  }

  return handleI18nRouting(request);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp3|wav|ogg|m4a|aac|flac)).*)",
    "/(api|trpc)(.*)",
  ],
};
