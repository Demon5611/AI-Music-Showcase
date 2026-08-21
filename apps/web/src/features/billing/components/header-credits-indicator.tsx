"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { Link } from "@/i18n/navigation";
import { useAuthSession } from "@/shared/hooks/use-auth-ready";
import { appShell } from "@/shared/theme/app-theme";
import { Skeleton } from "@/components/ui/skeleton";

type HeaderCreditsIndicatorProps = {
  className?: string;
};

function HeaderCreditsIndicatorSkeleton({ className }: HeaderCreditsIndicatorProps) {
  return (
    <div aria-hidden className={className ?? appShell.siteHeaderCredits}>
      <Skeleton className={appShell.siteHeaderCreditsSkeletonLabel} />
      <Skeleton className={appShell.siteHeaderCreditsSkeletonCta} />
    </div>
  );
}

export function HeaderCreditsIndicator({ className }: HeaderCreditsIndicatorProps) {
  const t = useTranslations("Billing.header");
  const format = useFormatter();
  const [mounted, setMounted] = useState(false);
  const { isSignedIn } = useAuthSession();
  const subscriptionQuery = useSubscriptionQuery();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <HeaderCreditsIndicatorSkeleton className={className} />;
  }

  if (!isSignedIn) {
    return null;
  }

  if (subscriptionQuery.isLoading) {
    return <HeaderCreditsIndicatorSkeleton className={className} />;
  }

  if (subscriptionQuery.isError || !subscriptionQuery.data) {
    return null;
  }

  const { creditsBalance } = subscriptionQuery.data;
  const balanceLabel = format.number(creditsBalance, {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(creditsBalance) ? 0 : 1,
  });
  const ariaDetail = t("ariaAvailable", { balance: balanceLabel, hint: "" });
  const titleDetail = t("titleAvailable", { balance: balanceLabel, hint: "" });

  return (
    <div
      aria-label={ariaDetail}
      className={className ?? appShell.siteHeaderCredits}
      title={titleDetail}
    >
      <span className={appShell.siteHeaderCreditsLabel}>
        {t("creditsLabel", { balance: balanceLabel })}
      </span>
      <Link className={appShell.siteHeaderCreditsTopUp} href="/pricing">
        {t("availableCredits")}
      </Link>
    </div>
  );
}
