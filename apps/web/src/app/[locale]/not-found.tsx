import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { appShell } from "@/shared/theme/app-theme";

export default async function NotFound() {
  const t = await getTranslations("SystemPages.notFound");

  return (
    <section className={appShell.placeholderPage}>
      <h1 className={appShell.placeholderPageTitle}>{t("title")}</h1>
      <p className={appShell.placeholderPageDescription}>{t("description")}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link className={appShell.formSubmit} href="/">
          {t("home")}
        </Link>
        <Link className={appShell.btnSecondary} href="/music-create">
          {t("create")}
        </Link>
      </div>
    </section>
  );
}
