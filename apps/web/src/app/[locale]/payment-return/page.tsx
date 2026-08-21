import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PaymentReturnPanel } from "@/features/billing/payment-return-panel";
import { LoadingPanel } from "@/shared/ui/elevenlabs";
import { routing, type Locale } from "@/i18n/routing";

type PaymentReturnPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PaymentReturnPageProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!hasLocale(routing.locales, localeParam)) {
    return {};
  }

  const locale = localeParam as Locale;
  const t = await getTranslations({ locale, namespace: "Metadata.paymentReturn" });

  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default async function PaymentReturnPage({ params }: PaymentReturnPageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <Suspense fallback={<LoadingPanel />}>
      <PaymentReturnPanel />
    </Suspense>
  );
}
