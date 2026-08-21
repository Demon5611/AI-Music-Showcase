import {
  PAYMENT_RETURN_PAGE_SLUG,
  PAYMENT_RETURN_PURCHASE_ID_QUERY,
  type PaymentReturnLocale,
} from "@ai-music/shared";
import { NextResponse, type NextRequest } from "next/server";

export function redirectToPaymentReturnPage(
  request: NextRequest,
  locale: PaymentReturnLocale,
  purchaseId: string | null,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/${PAYMENT_RETURN_PAGE_SLUG}`;
  url.search = "";
  url.hash = "";
  if (purchaseId) {
    url.searchParams.set(PAYMENT_RETURN_PURCHASE_ID_QUERY, purchaseId);
  }
  return NextResponse.redirect(url, 303);
}
