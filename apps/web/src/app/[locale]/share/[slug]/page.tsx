import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { PlaceholderPage } from "@/shared/ui/placeholder-page";
import { routing } from "@/i18n/routing";

type SharePageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function SharePage({ params }: SharePageProps) {
  const { locale, slug } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "SystemPages.share" });

  return (
    <PlaceholderPage
      actionHref="/"
      actionLabel={t("home")}
      description={t("description", { slug })}
      title={t("title")}
    />
  );
}
