"use client";

import { useTranslations } from "next-intl";
import { legal } from "@/features/legal/legal-classes";
import { Link } from "@/i18n/navigation";

type PurchaseLegalNoticeProps = {
  className?: string;
};

/**
 * Reusable disclosure for Pricing and future TBC checkout CTA.
 * Does not gate payments, store consent, or call billing APIs.
 */
export function PurchaseLegalNotice({ className }: PurchaseLegalNoticeProps) {
  const t = useTranslations("Legal.purchaseNotice");

  return (
    <p className={className ?? legal.purchaseNotice}>
      {t.rich("text", {
        terms: (chunks) => (
          <Link className={legal.link} href="/terms">
            {chunks}
          </Link>
        ),
        refund: (chunks) => (
          <Link className={legal.link} href="/refund">
            {chunks}
          </Link>
        ),
        privacy: (chunks) => (
          <Link className={legal.link} href="/privacy">
            {chunks}
          </Link>
        ),
        legalInfo: (chunks) => (
          <Link className={legal.link} href="/legal/business-information">
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}
