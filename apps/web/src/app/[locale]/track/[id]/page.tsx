import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { PlaceholderPage } from "@/shared/ui/placeholder-page";
import { routing } from "@/i18n/routing";

type TrackPageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export default async function TrackPage({ params }: TrackPageProps) {
  const { locale, id } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "SystemPages.track" });

  return (
    <PlaceholderPage
      actionHref={`/share/${id}`}
      actionLabel={t("share")}
      description={t("description", { id })}
      title={t("title")}
    />
  );
}
