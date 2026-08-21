"use client";

import type { ReactNode } from "react";
import { SignInButton } from "@clerk/nextjs";
import {
  CREDIT_PACKAGES,
  FREE_CREDIT_OFFER,
  OPERATION_COST_CREDITS,
  getPackagePersonalVoiceExample,
  getPackageSavingsPercent,
  getPackageStandardExample,
  type PurchasableCreditPackageId,
} from "@ai-music/shared";
import { useFormatter, useTranslations } from "next-intl";

import { PurchaseLegalNotice } from "@/features/legal/purchase-legal-notice";
import { pricing } from "@/features/billing/pricing-classes";
import {
  useCreditPackCheckout,
  type CreditPackCheckoutControls,
} from "@/features/billing/hooks/use-credit-pack-checkout";
import {
  gelMajorForPackage,
  useCreditPackPricingFx,
} from "@/features/billing/hooks/use-credit-pack-pricing-fx";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { env } from "@/shared/config/env";
import { useAuthSession } from "@/shared/hooks/use-auth-ready";

function SignInCta({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  if (!env.isClerkEnabled) {
    return (
      <Link className={className} href="/music-create">
        {children}
      </Link>
    );
  }

  return (
    <SignInButton mode="modal">
      <button className={className} type="button">
        {children}
      </button>
    </SignInButton>
  );
}
function formatUsd(format: ReturnType<typeof useFormatter>, amount: number): string {
  return format.number(amount, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Same core capabilities on every pack — packs differ by balance / unit price only. */
function CoreProductFeatures() {
  const t = useTranslations("Pricing.packages");

  return (
    <>
      <li>{t("sharedFeatures.allTools")}</li>
      <li>{t("sharedFeatures.standardVocal")}</li>
      <li>{t("sharedFeatures.musicEditor")}</li>
      <li>{t("sharedFeatures.exportsIncluded")}</li>
      <li>
        {t("sharedFeatures.personalVoiceAvailable", {
          count: OPERATION_COST_CREDITS.createPersonalVoice,
        })}
      </li>
    </>
  );
}

function FreePackageCard() {
  const t = useTranslations("Pricing.packages");
  const format = useFormatter();
  const { isSignedIn } = useAuthSession();
  const example = getPackageStandardExample("free");

  return (
    <article className={pricing.card} data-package-id={FREE_CREDIT_OFFER.id}>
      <div className={pricing.cardHeader}>
        <div className={pricing.planTitleRow}>
          <h2 className={pricing.planName}>{t("free.name")}</h2>
        </div>
        <p className={pricing.planPrice}>
          {formatUsd(format, FREE_CREDIT_OFFER.priceUsd)}
        </p>
        <p className={pricing.credits}>
          {t("creditsCount", { count: FREE_CREDIT_OFFER.credits })}
        </p>
        <p className={pricing.planTagline}>{t("free.shortDescription")}</p>
      </div>

      <ul className={pricing.featureList}>
        <CoreProductFeatures />
        <li>
          {t("examples.standardGenerations", {
            generations: example.generations,
            variants: example.variants,
          })}
        </li>
      </ul>

      <div className={pricing.actionWrap}>
        {isSignedIn ? (
          <Link className={pricing.primaryButton} href="/music-create">
            {t("free.cta")}
          </Link>
        ) : (
          <SignInCta className={pricing.primaryButton}>{t("free.cta")}</SignInCta>
        )}
      </div>
    </article>
  );
}

function StarterPackageCard({
  checkout,
  gelMajor,
}: {
  checkout: CreditPackCheckoutControls;
  gelMajor: string | null;
}) {
  const t = useTranslations("Pricing.packages");
  const format = useFormatter();
  const pkg = CREDIT_PACKAGES.find((item) => item.id === "starter")!;
  const example = getPackageStandardExample("starter");

  return (
    <PaidPackageShell
      packageId={pkg.id}
      name={t("starter.name")}
      priceUsd={pkg.priceUsd}
      gelMajor={gelMajor}
      credits={pkg.credits}
      featured={pkg.featured}
      bestValue={pkg.bestValue}
      badge={null}
      savingsPercent={null}
      format={format}
      buyLabel={t("starter.cta", { count: pkg.credits })}
      checkout={checkout}
    >
      <li>{t("starter.shortDescription")}</li>
      <CoreProductFeatures />
      <li>
        {t("examples.standardGenerations", {
          generations: example.generations,
          variants: example.variants,
        })}
      </li>
    </PaidPackageShell>
  );
}

function CreatorPackageCard({
  checkout,
  gelMajor,
}: {
  checkout: CreditPackCheckoutControls;
  gelMajor: string | null;
}) {
  const t = useTranslations("Pricing.packages");
  const format = useFormatter();
  const pkg = CREDIT_PACKAGES.find((item) => item.id === "creator")!;
  const example = getPackagePersonalVoiceExample("creator");
  const savings = getPackageSavingsPercent("creator");

  return (
    <PaidPackageShell
      packageId={pkg.id}
      name={t("creator.name")}
      priceUsd={pkg.priceUsd}
      gelMajor={gelMajor}
      credits={pkg.credits}
      featured={pkg.featured}
      bestValue={pkg.bestValue}
      badge={t("creator.badge")}
      savingsPercent={savings}
      format={format}
      buyLabel={t("creator.cta", { count: pkg.credits })}
      checkout={checkout}
    >
      <CoreProductFeatures />
      <li>{t("purchasingPower.enoughForPersonalVoice")}</li>
      <li>
        {t("examples.withVoice", {
          voice: example.personalVoiceCreations,
          generations: example.generationsAfterVoice,
          variants: example.variantsAfterVoice,
        })}
      </li>
      <li>
        {t("examples.withoutVoice", {
          generations: example.generationsWithoutNewVoice,
        })}
      </li>
    </PaidPackageShell>
  );
}

function StudioPackageCard({
  checkout,
  gelMajor,
}: {
  checkout: CreditPackCheckoutControls;
  gelMajor: string | null;
}) {
  const t = useTranslations("Pricing.packages");
  const format = useFormatter();
  const pkg = CREDIT_PACKAGES.find((item) => item.id === "studio")!;
  const example = getPackagePersonalVoiceExample("studio");
  const savings = getPackageSavingsPercent("studio");

  return (
    <PaidPackageShell
      packageId={pkg.id}
      name={t("studio.name")}
      priceUsd={pkg.priceUsd}
      gelMajor={gelMajor}
      credits={pkg.credits}
      featured={pkg.featured}
      bestValue={pkg.bestValue}
      badge={t("studio.badge")}
      savingsPercent={savings}
      format={format}
      buyLabel={t("studio.cta", { count: pkg.credits })}
      checkout={checkout}
    >
      <CoreProductFeatures />
      <li>{t("purchasingPower.enoughForPersonalVoice")}</li>
      <li>
        {t("examples.withVoice", {
          voice: example.personalVoiceCreations,
          generations: example.generationsAfterVoice,
          variants: example.variantsAfterVoice,
        })}
      </li>
      <li>
        {t("examples.withoutVoice", {
          generations: example.generationsWithoutNewVoice,
        })}
      </li>
    </PaidPackageShell>
  );
}

function PaidPackageCta({
  packageId,
  buyLabel,
  checkout,
}: {
  packageId: PurchasableCreditPackageId;
  buyLabel: string;
  checkout: CreditPackCheckoutControls;
}) {
  const t = useTranslations("Pricing.packages");
  const { isSignedIn } = useAuthSession();
  const pendingLabel = t("paymentsPending");
  const starting = checkout.busy && checkout.pendingPackageId === packageId;

  if (!checkout.checkoutEnabled) {
    return (
      <>
        <button
          className={pricing.disabledButton}
          disabled
          type="button"
          title={pendingLabel}
          aria-label={`${buyLabel}. ${pendingLabel}`}
          data-checkout={checkout.statusLoading ? "loading" : "disabled"}
        >
          {buyLabel}
        </button>
        {checkout.statusLoading ? null : (
          <p className={pricing.paymentPendingNote}>{pendingLabel}</p>
        )}
      </>
    );
  }

  if (!isSignedIn) {
    return (
      <SignInCta className={pricing.primaryButton}>
        <span data-checkout="sign-in">{buyLabel}</span>
      </SignInCta>
    );
  }

  return (
    <button
      className={checkout.busy ? pricing.disabledButton : pricing.primaryButton}
      type="button"
      disabled={checkout.busy}
      aria-busy={starting}
      data-checkout={checkout.busy ? "pending" : "ready"}
      onClick={() => {
        void checkout.startCheckout(packageId);
      }}
    >
      {starting ? t("checkoutStarting") : buyLabel}
    </button>
  );
}

function PaidPackageShell({
  packageId,
  name,
  priceUsd,
  gelMajor,
  credits,
  featured,
  bestValue,
  badge,
  savingsPercent,
  format,
  buyLabel,
  checkout,
  children,
}: {
  packageId: PurchasableCreditPackageId;
  name: string;
  priceUsd: number;
  gelMajor: string | null;
  credits: number;
  featured: boolean;
  bestValue: boolean;
  badge: string | null;
  savingsPercent: number | null;
  format: ReturnType<typeof useFormatter>;
  buyLabel: string;
  checkout: CreditPackCheckoutControls;
  children: ReactNode;
}) {
  const t = useTranslations("Pricing.packages");

  return (
    <article
      className={cn(pricing.card, featured || bestValue ? pricing.cardRecommended : undefined)}
      data-package-id={packageId}
    >
      <div className={pricing.cardHeader}>
        <div className={pricing.planTitleRow}>
          <h2 className={pricing.planName}>{name}</h2>
          {badge ? <span className={pricing.planBadge}>{badge}</span> : null}
        </div>
        <p className={pricing.planPrice}>{formatUsd(format, priceUsd)}</p>
        {gelMajor ? (
          <p className={pricing.planPriceHint} data-gel-approx={gelMajor}>
            {t("approxGel", { amount: gelMajor })}
          </p>
        ) : null}
        <p className={pricing.credits}>{t("creditsCount", { count: credits })}</p>
        {savingsPercent !== null ? (
          <p className={pricing.saveBadge}>
            {t("saveVsStarter", { percent: savingsPercent })}
          </p>
        ) : null}
      </div>

      <ul className={pricing.featureList}>{children}</ul>

      <div className={pricing.actionWrap}>
        <PaidPackageCta packageId={packageId} buyLabel={buyLabel} checkout={checkout} />
      </div>
    </article>
  );
}

export function CreditPackagesPricingPanel() {
  const t = useTranslations("Pricing.packages");
  const checkout = useCreditPackCheckout();
  const pricingFx = useCreditPackPricingFx();
  const quote = pricingFx.data;

  return (
    <section className={pricing.page} data-billing-mode="credit_packages">
      <h1 className={pricing.title}>{t("title")}</h1>
      <p className={pricing.subtitle}>{t("headline")}</p>

      {checkout.error ? (
        <p className={pricing.error} role="alert">
          {checkout.error}
        </p>
      ) : null}

      <div className={pricing.gridPackages}>
        <FreePackageCard />
        <StarterPackageCard
          checkout={checkout}
          gelMajor={gelMajorForPackage(quote, "starter")}
        />
        <CreatorPackageCard
          checkout={checkout}
          gelMajor={gelMajorForPackage(quote, "creator")}
        />
        <StudioPackageCard
          checkout={checkout}
          gelMajor={gelMajorForPackage(quote, "studio")}
        />
      </div>

      <p className={pricing.subtitle}>{t("explanation")}</p>
      <p className={pricing.paymentPendingNote}>{t("gelPaymentNote")}</p>
      <p className={pricing.paymentPendingNote}>{t("examplesDisclaimer")}</p>

      <section className={pricing.faq}>
        <h2 className={pricing.faqTitle}>{t("faqTitle")}</h2>
        <dl className={pricing.faqList}>
          <div>
            <dt className={pricing.faqQuestion}>{t("faq.differQ")}</dt>
            <dd className={pricing.faqAnswer}>{t("faq.differA")}</dd>
          </div>
          <div>
            <dt className={pricing.faqQuestion}>{t("faq.subscriptionQ")}</dt>
            <dd className={pricing.faqAnswer}>{t("faq.subscriptionA")}</dd>
          </div>
          <div>
            <dt className={pricing.faqQuestion}>{t("faq.creditsQ")}</dt>
            <dd className={pricing.faqAnswer}>{t("faq.creditsA")}</dd>
          </div>
          <div>
            <dt className={pricing.faqQuestion}>{t("faq.moneyQ")}</dt>
            <dd className={pricing.faqAnswer}>{t("faq.moneyA")}</dd>
          </div>
        </dl>
      </section>

      <PurchaseLegalNotice />

      <p className={pricing.legalLinks}>
        <Link className={pricing.legalLink} href="/terms">
          {t("termsLink")}
        </Link>
        <span aria-hidden className={pricing.legalSep}>
          ·
        </span>
        <Link className={pricing.legalLink} href="/privacy">
          {t("privacyLink")}
        </Link>
        <span aria-hidden className={pricing.legalSep}>
          ·
        </span>
        <Link className={pricing.legalLink} href="/refund">
          {t("refundLink")}
        </Link>
        <span aria-hidden className={pricing.legalSep}>
          ·
        </span>
        <Link className={pricing.legalLink} href="/legal/business-information">
          {t("legalInfoLink")}
        </Link>
      </p>
    </section>
  );
}
