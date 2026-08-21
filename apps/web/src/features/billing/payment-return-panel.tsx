"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { resolvePaymentReturnUxState } from "@ai-music/shared";

import { paymentReturn } from "@/features/billing/payment-return-classes";
import { usePaymentReturnPurchase } from "@/features/billing/hooks/use-payment-return-purchase";
import { Link, useRouter } from "@/i18n/navigation";
import { parseApiError } from "@/shared/lib/parse-api-error";
import { RequireAuth } from "@/shared/ui/require-auth";
import { LoadingPanel } from "@/shared/ui/elevenlabs";

const SUCCESS_REDIRECT_MS = 2500;

function ReturnActions({
  href,
  label,
}: {
  href: "/pricing" | "/profile";
  label: string;
}) {
  return (
    <div className={paymentReturn.actions}>
      <Link className={paymentReturn.primary} href={href}>
        {label}
      </Link>
    </div>
  );
}

function MissingPurchaseState() {
  const t = useTranslations("PaymentReturn");
  return (
    <div className={paymentReturn.card}>
      <p className={paymentReturn.error}>{t("missingPurchase")}</p>
      <ReturnActions href="/pricing" label={t("backToPricing")} />
    </div>
  );
}

function PaymentReturnStatusCard() {
  const t = useTranslations("PaymentReturn");
  const router = useRouter();
  const { query } = usePaymentReturnPurchase();
  const ux = resolvePaymentReturnUxState(query.data?.status);

  useEffect(() => {
    if (ux !== "success") {
      return;
    }
    const timer = window.setTimeout(() => {
      router.replace("/profile");
    }, SUCCESS_REDIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [router, ux]);

  if (query.isPending && !query.data) {
    return <LoadingPanel />;
  }

  if (query.isError && !query.data) {
    return (
      <div className={paymentReturn.card}>
        <p className={paymentReturn.error}>
          {parseApiError(query.error, t("statusFailed"), { preferFallback: true })}
        </p>
        <ReturnActions href="/pricing" label={t("backToPricing")} />
      </div>
    );
  }

  return (
    <div className={paymentReturn.card} data-payment-return={ux}>
      {ux === "pending" ? (
        <>
          <p>{t("pending")}</p>
          <LoadingPanel lines={2} />
        </>
      ) : null}
      {ux === "success" ? (
        <>
          <p>{t("success", { credits: query.data?.creditsAmount ?? 0 })}</p>
          <ReturnActions href="/profile" label={t("goToProfile")} />
        </>
      ) : null}
      {ux === "failed" ? (
        <>
          <p>{t("failed")}</p>
          <ReturnActions href="/pricing" label={t("backToPricing")} />
        </>
      ) : null}
    </div>
  );
}

function PaymentReturnContent() {
  const { purchaseId } = usePaymentReturnPurchase();
  if (!purchaseId) {
    return <MissingPurchaseState />;
  }
  return <PaymentReturnStatusCard />;
}

export function PaymentReturnPanel() {
  const t = useTranslations("PaymentReturn");

  return (
    <main className={paymentReturn.page}>
      <h1 className={paymentReturn.title}>{t("title")}</h1>
      <p className={paymentReturn.description}>{t("description")}</p>
      <RequireAuth hint={t("authHint")} title={t("authTitle")}>
        <PaymentReturnContent />
      </RequireAuth>
    </main>
  );
}
