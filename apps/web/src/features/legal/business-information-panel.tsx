"use client";

import { useTranslations } from "next-intl";
import { LegalEntityDetails } from "@/features/legal/legal-entity-details";
import { legal } from "@/features/legal/legal-classes";

/**
 * Canonical public trader / controller registration details.
 * Only this surface should render the full LEGAL_ENTITY block.
 */
export function BusinessInformationPanel() {
  const t = useTranslations("Legal.businessInformation");

  return (
    <article className={legal.page}>
      <h1 className={legal.title}>{t("title")}</h1>
      <p className={legal.lead}>{t("lead")}</p>
      <LegalEntityDetails />
    </article>
  );
}
