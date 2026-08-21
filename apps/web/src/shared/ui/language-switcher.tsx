"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";
import { appShell } from "@/shared/theme/app-theme";

function LanguageSwitcherButtons() {
  const t = useTranslations("LanguageSwitcher");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchLocale(nextLocale: Locale) {
    if (nextLocale === locale) {
      return;
    }

    const query = searchParams.toString();
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const href = `${query ? `${pathname}?${query}` : pathname}${hash}`;
    router.replace(href, { locale: nextLocale });
  }

  return (
    <div aria-label={t("label")} className={appShell.languageSwitcher} role="group">
      {locales.map((item, index) => (
        <span key={item} className="inline-flex items-center">
          {index > 0 ? (
            <span aria-hidden className={appShell.languageSwitcherDivider}>
              |
            </span>
          ) : null}
          <button
            aria-current={item === locale ? "true" : undefined}
            aria-label={t(item)}
            className={cn(
              appShell.languageSwitcherButton,
              item === locale && appShell.languageSwitcherButtonActive,
            )}
            type="button"
            onClick={() => switchLocale(item)}
          >
            {t(item)}
          </button>
        </span>
      ))}
    </div>
  );
}

export function LanguageSwitcher() {
  return (
    <Suspense fallback={<span aria-hidden className={appShell.languageSwitcherPlaceholder} />}>
      <LanguageSwitcherButtons />
    </Suspense>
  );
}
