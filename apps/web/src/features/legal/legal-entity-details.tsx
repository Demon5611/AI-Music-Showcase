"use client";

import { useTranslations } from "next-intl";
import { legal } from "@/features/legal/legal-classes";
import { LEGAL_ENTITY } from "@/shared/config/legal";
import { SupportEmailLink } from "@/shared/ui/support-email-link";

type LegalEntityDetailsProps = {
  className?: string;
};

export function LegalEntityDetails({ className }: LegalEntityDetailsProps) {
  const t = useTranslations("Legal.operator");

  return (
    <aside className={className ? `${legal.entityBlock} ${className}` : legal.entityBlock}>
      <h2 className={legal.entityTitle}>{t("title")}</h2>
      <dl className={legal.entityList}>
        <div className={legal.entityRow}>
          <dt className={legal.entityLabel}>{t("name")}</dt>
          <dd className={legal.entityValue}>{LEGAL_ENTITY.displayName}</dd>
        </div>
        <div className={legal.entityRow}>
          <dt className={legal.entityLabel}>{t("legalForm")}</dt>
          <dd className={legal.entityValue}>{t("legalFormValue")}</dd>
        </div>
        <div className={legal.entityRow}>
          <dt className={legal.entityLabel}>{t("country")}</dt>
          <dd className={legal.entityValue}>{t("countryValue")}</dd>
        </div>
        <div className={legal.entityRow}>
          <dt className={legal.entityLabel}>{t("identificationNumber")}</dt>
          <dd className={legal.entityValue}>{LEGAL_ENTITY.identificationNumber}</dd>
        </div>
        <div className={legal.entityRow}>
          <dt className={legal.entityLabel}>{t("registrationDate")}</dt>
          <dd className={legal.entityValue}>{LEGAL_ENTITY.registrationDate}</dd>
        </div>
        <div className={legal.entityRow}>
          <dt className={legal.entityLabel}>{t("registeringAuthority")}</dt>
          <dd className={legal.entityValue}>{LEGAL_ENTITY.registeringAuthority}</dd>
        </div>
        <div className={legal.entityRow}>
          <dt className={legal.entityLabel}>{t("address")}</dt>
          <dd className={legal.entityValue}>{LEGAL_ENTITY.businessAddress}</dd>
        </div>
        <div className={legal.entityRow}>
          <dt className={legal.entityLabel}>{t("serviceName")}</dt>
          <dd className={legal.entityValue}>{LEGAL_ENTITY.serviceName}</dd>
        </div>
        <div className={legal.entityRow}>
          <dt className={legal.entityLabel}>{t("email")}</dt>
          <dd className={legal.entityValue}>
            <SupportEmailLink aria-label={t("email")} className={legal.link} />
          </dd>
        </div>
      </dl>
    </aside>
  );
}
