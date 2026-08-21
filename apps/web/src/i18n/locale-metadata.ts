import type { Locale } from "@/i18n/routing";
import { locales } from "@/i18n/routing";
import { SITE_URL } from "@/shared/config/site";

const OPEN_GRAPH_LOCALE: Record<Locale, string> = {
  en: "en_US",
  ru: "ru_RU",
  ka: "ka_GE",
};

/** hreflang map for a path without locale prefix (e.g. `/pricing` or ``). */
export function buildLocaleLanguageAlternates(pathAfterLocale: string = ""): Record<string, string> {
  const suffix = pathAfterLocale === "" || pathAfterLocale === "/"
    ? ""
    : pathAfterLocale.startsWith("/")
      ? pathAfterLocale
      : `/${pathAfterLocale}`;

  const languages: Record<string, string> = {
    "x-default": `${SITE_URL}/en${suffix}`,
  };

  for (const locale of locales) {
    languages[locale] = `${SITE_URL}/${locale}${suffix}`;
  }

  return languages;
}

export function openGraphLocaleFields(locale: Locale): {
  locale: string;
  alternateLocale: string[];
} {
  return {
    locale: OPEN_GRAPH_LOCALE[locale],
    alternateLocale: locales
      .filter((item) => item !== locale)
      .map((item) => OPEN_GRAPH_LOCALE[item]),
  };
}
