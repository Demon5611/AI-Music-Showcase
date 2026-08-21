import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SunoVoiceVerifyPanel } from "@/features/voice/suno-voice-verify-panel";
import { SITE_URL } from "@/shared/config/site";
import { buildLocaleLanguageAlternates } from "@/i18n/locale-metadata";
import { routing, type Locale } from "@/i18n/routing";

type ConsentPageProps = {
  params: Promise<{ locale: string }>;
};

function ConsentLoadingFallback({ label }: { label: string }) {
  return <p>{label}</p>;
}

export async function generateMetadata({ params }: ConsentPageProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!hasLocale(routing.locales, localeParam)) {
    return {};
  }

  const locale = localeParam as Locale;
  const t = await getTranslations({ locale, namespace: "Metadata.consent" });
  const title = t("title");
  const description = t("description");
  const canonicalPath = `/${locale}/consent`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: {
      canonical: canonicalPath,
      languages: buildLocaleLanguageAlternates("/consent"),
    },
  };
}

export default async function ConsentPage({ params }: ConsentPageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "SystemPages" });

  return (
    <Suspense fallback={<ConsentLoadingFallback label={t("consentLoading")} />}>
      <SunoVoiceVerifyPanel />
    </Suspense>
  );
}
