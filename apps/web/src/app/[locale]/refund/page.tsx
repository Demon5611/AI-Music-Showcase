import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { RefundPolicyPanel } from "@/features/legal/refund-policy-panel";
import { SITE_URL } from "@/shared/config/site";
import {
  buildLocaleLanguageAlternates,
  openGraphLocaleFields,
} from "@/i18n/locale-metadata";
import { routing, type Locale } from "@/i18n/routing";

type RefundPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: RefundPageProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!hasLocale(routing.locales, localeParam)) {
    return {};
  }

  const locale = localeParam as Locale;
  const t = await getTranslations({ locale, namespace: "Metadata.refund" });
  const title = t("title");
  const description = t("description");
  const canonicalPath = `/${locale}/refund`;

  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: canonicalPath,
      languages: buildLocaleLanguageAlternates("/refund"),
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${canonicalPath}`,
      ...openGraphLocaleFields(locale),
      type: "website",
      siteName: "AI Music",
    },
  };
}

export default async function RefundPage({ params }: RefundPageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return <RefundPolicyPanel />;
}
