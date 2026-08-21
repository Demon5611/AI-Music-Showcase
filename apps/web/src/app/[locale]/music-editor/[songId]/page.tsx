import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AudioEditor } from "@/features/music-editor/audio-editor";
import { SITE_URL } from "@/shared/config/site";
import { buildLocaleLanguageAlternates } from "@/i18n/locale-metadata";
import { routing, type Locale } from "@/i18n/routing";

type MusicEditorPageProps = {
  params: Promise<{ locale: string; songId: string }>;
};

export async function generateMetadata({
  params,
}: MusicEditorPageProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!hasLocale(routing.locales, localeParam)) {
    return {};
  }

  const locale = localeParam as Locale;
  const t = await getTranslations({ locale, namespace: "Metadata.editor" });
  const title = t("title");
  const description = t("description");
  const canonicalPath = `/${locale}/music-editor`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: {
      canonical: canonicalPath,
      languages: buildLocaleLanguageAlternates("/music-editor"),
    },
  };
}

export default async function MusicEditorPage({ params }: MusicEditorPageProps) {
  const { locale, songId } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return <AudioEditor songId={songId} />;
}
