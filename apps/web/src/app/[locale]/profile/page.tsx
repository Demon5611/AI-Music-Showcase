import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ProfilePanel } from "@/features/profile/profile-panel";
import { SITE_URL } from "@/shared/config/site";
import { buildLocaleLanguageAlternates } from "@/i18n/locale-metadata";
import { routing, type Locale } from "@/i18n/routing";

type ProfilePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!hasLocale(routing.locales, localeParam)) {
    return {};
  }

  const locale = localeParam as Locale;
  const t = await getTranslations({ locale, namespace: "Metadata.profile" });
  const title = t("title");
  const description = t("description");
  const canonicalPath = `/${locale}/profile`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: {
      canonical: canonicalPath,
      languages: buildLocaleLanguageAlternates("/profile"),
    },
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return <ProfilePanel />;
}
