"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { appShell } from "@/shared/theme/app-theme";

interface LocaleErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LocaleError({ reset }: LocaleErrorProps) {
  const t = useTranslations("SystemPages.error");

  return (
    <section className={appShell.placeholderPage} role="alert">
      <h1 className={appShell.placeholderPageTitle}>{t("title")}</h1>
      <p className={appShell.placeholderPageDescription}>{t("description")}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button className={appShell.formSubmit} type="button" onClick={reset}>
          {t("retry")}
        </button>
        <Link className={appShell.btnSecondary} href="/">
          {t("home")}
        </Link>
      </div>
    </section>
  );
}
