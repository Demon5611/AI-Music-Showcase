import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { MusicHistoryPage } from "@/features/music-history/music-history-page";
import { SITE_URL } from "@/shared/config/site";
import { buildLocaleLanguageAlternates } from "@/i18n/locale-metadata";
import { routing, type Locale } from "@/i18n/routing";

type HistoryPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: HistoryPageProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!hasLocale(routing.locales, localeParam)) {
    return {};
  }

  const locale = localeParam as Locale;
  const t = await getTranslations({ locale, namespace: "Metadata.history" });
  const title = t("title");
  const description = t("description");
  const canonicalPath = `/${locale}/history`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: {
      canonical: canonicalPath,
      languages: buildLocaleLanguageAlternates("/history"),
    },
  };
}

export default async function HistoryPage({ params }: HistoryPageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return <MusicHistoryPage />;
}
