"use client";

import { useFormatter, useTranslations } from "next-intl";
import { legal } from "@/features/legal/legal-classes";
import {
  LEGAL_DOCUMENT_DATES,
  type LegalDocumentId,
} from "@/shared/config/legal";

type LegalEffectiveDateProps = {
  document: LegalDocumentId;
};

export function LegalEffectiveDate({ document }: LegalEffectiveDateProps) {
  const t = useTranslations("Legal.common");
  const format = useFormatter();
  const isoDate = LEGAL_DOCUMENT_DATES[document];
  const formatted = format.dateTime(new Date(`${isoDate}T00:00:00.000Z`), {
    dateStyle: "long",
    timeZone: "UTC",
  });

  return (
    <p className={legal.meta}>
      {t("effectiveDate", { date: formatted })}
    </p>
  );
}
