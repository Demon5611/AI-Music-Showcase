"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { appShell } from "@/shared/theme/app-theme";
import { SupportEmailLink } from "@/shared/ui/support-email-link";

const FOOTER_LEGAL_LINKS = [
  { href: "/terms", labelKey: "termsLink" },
  { href: "/privacy", labelKey: "privacyLink" },
  { href: "/refund", labelKey: "refundLink" },
  { href: "/legal/business-information", labelKey: "legalInfoLink" },
] as const;

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    <footer className={appShell.siteFooter}>
      <div className={appShell.siteFooterInner}>
        <div className={appShell.siteFooterSupport}>
          <p className={appShell.siteFooterSupportLabel}>{t("support")}</p>
          <SupportEmailLink
            aria-label={t("supportEmailAriaLabel")}
            className={appShell.siteFooterEmailLink}
          />
        </div>

        <nav aria-label={t("legalNavLabel")} className={appShell.siteFooterNav}>
          {FOOTER_LEGAL_LINKS.map((item) => (
            <Link key={item.href} className={appShell.siteFooterNavLink} href={item.href}>
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
