"use client";

import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { env } from "@/shared/config/env";
import { useClientMounted } from "@/shared/hooks/use-client-mounted";
import { Link } from "@/i18n/navigation";
import { appShell } from "@/shared/theme/app-theme";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { HeaderCreditsIndicator } from "@/features/billing/components/header-credits-indicator";

const NAV_HREFS = [
  { href: "/music-create", labelKey: "musicCreate" },
  { href: "/history", labelKey: "history" },
  { href: "/profile", labelKey: "profile" },
  { href: "/pricing", labelKey: "pricing" },
] as const;

function DevAuthBadge() {
  const t = useTranslations("SystemPages");

  return (
    <span className={appShell.siteHeaderDevBadge} title={t("devAuthBadgeTitle")}>
      Dev: {env.devAuthUserId}
    </span>
  );
}

function AuthHeaderActions({ compact = false }: { compact?: boolean }) {
  const mounted = useClientMounted();
  const t = useTranslations("Common");
  const locale = useLocale();

  if (!mounted) {
    return (
      <div
        aria-hidden
        className={compact ? "h-9 w-full" : `${appShell.siteHeaderAuthActions} min-h-9`}
      />
    );
  }

  if (!env.isClerkEnabled) {
    return <DevAuthBadge />;
  }

  const buttonClass = compact
    ? `${appShell.siteHeaderAuthButton} w-full justify-center`
    : appShell.siteHeaderAuthButton;
  const primaryClass = compact
    ? `${appShell.siteHeaderAuthButtonPrimary} w-full justify-center`
    : appShell.siteHeaderAuthButtonPrimary;

  return (
    <div className={compact ? "flex w-full flex-col gap-2" : appShell.siteHeaderAuthActions}>
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className={buttonClass}>
            {t("signIn")}
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className={primaryClass}>
            {t("signUp")}
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl={`/${locale}`} />
      </SignedIn>
    </div>
  );
}

function SiteHeaderNav({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className: string;
}) {
  const t = useTranslations("Navigation");

  return (
    <nav className={className}>
      {NAV_HREFS.map((item) => (
        <Link
          key={item.href}
          className={appShell.siteHeaderNavLink}
          href={item.href}
          onClick={onNavigate}
        >
          {t(item.labelKey)}
        </Link>
      ))}
    </nav>
  );
}

export function SiteHeader() {
  const tCommon = useTranslations("Common");
  const tNav = useTranslations("Navigation");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  function closeMobileNav() {
    setIsMobileNavOpen(false);
  }

  function toggleMobileNav() {
    setIsMobileNavOpen((open) => !open);
  }

  return (
    <header className={appShell.siteHeader}>
      <div className={appShell.siteHeaderBar}>
        <Link className={appShell.siteHeaderLogo} href="/">
          {tCommon("brandName")}
        </Link>

        <SiteHeaderNav className={appShell.siteHeaderNav} />

        <div className={appShell.siteHeaderActions}>
          <LanguageSwitcher />
          <HeaderCreditsIndicator />
          <ThemeToggle />
          <div className="hidden md:contents">
            <AuthHeaderActions />
          </div>
          {isMobileNavOpen ? (
            <button
              aria-controls="site-header-mobile-nav"
              aria-expanded="true"
              aria-label={tNav("closeMenu")}
              className={appShell.siteHeaderMenuButton}
              type="button"
              onClick={toggleMobileNav}
            >
              <X aria-hidden className={appShell.siteHeaderMenuIcon} />
            </button>
          ) : (
            <button
              aria-controls="site-header-mobile-nav"
              aria-expanded="false"
              aria-label={tNav("openMenu")}
              className={appShell.siteHeaderMenuButton}
              type="button"
              onClick={toggleMobileNav}
            >
              <Menu aria-hidden className={appShell.siteHeaderMenuIcon} />
            </button>
          )}
        </div>
      </div>

      {isMobileNavOpen ? (
        <div className={appShell.siteHeaderNavMobile} id="site-header-mobile-nav">
          <SiteHeaderNav className="flex flex-col gap-0.5" onNavigate={closeMobileNav} />
          <div className="mt-3 border-t border-[var(--app-border-subtle)] pt-3 md:hidden">
            <HeaderCreditsIndicator className="mb-3 flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between" />
            <AuthHeaderActions compact />
          </div>
        </div>
      ) : null}
    </header>
  );
}
