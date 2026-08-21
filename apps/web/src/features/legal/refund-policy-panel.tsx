"use client";

import { useTranslations } from "next-intl";
import { asStringList } from "@/features/legal/as-string-list";
import { LegalEffectiveDate } from "@/features/legal/legal-effective-date";
import { legal } from "@/features/legal/legal-classes";
import { legalBusinessInformationTag } from "@/features/legal/legal-business-information-tag";
import {
  LegalBulletList,
  LegalParagraphs,
  LegalSection,
} from "@/features/legal/legal-section";
import { Link } from "@/i18n/navigation";
import { legalSupportEmailTag } from "@/features/legal/legal-support-email-tag";

export function RefundPolicyPanel() {
  const t = useTranslations("Legal.refund");

  return (
    <article className={legal.page}>
      <h1 className={legal.title}>{t("title")}</h1>
      <p className={legal.lead}>{t("lead")}</p>
      <LegalEffectiveDate document="refund" />

      <LegalSection id="refund-definitions" title={t("definitions.title")}>
        <LegalParagraphs
          items={[t("definitions.p1"), t("definitions.p2"), t("definitions.p3")]}
        />
      </LegalSection>

      <LegalSection id="refund-model" title={t("model.title")}>
        <LegalParagraphs items={[t("model.p1"), t("model.p2")]} />
      </LegalSection>

      <LegalSection id="refund-failed" title={t("failedOps.title")}>
        <LegalParagraphs
          items={[
            t("failedOps.p1"),
            t("failedOps.p2"),
            t("failedOps.p3"),
            t("failedOps.p4"),
            t("failedOps.p5"),
          ]}
        />
      </LegalSection>

      <LegalSection id="refund-unsatisfactory" title={t("unsatisfactory.title")}>
        <LegalParagraphs items={[t("unsatisfactory.p1"), t("unsatisfactory.p2")]} />
      </LegalSection>

      <LegalSection id="refund-purchase-remainder" title={t("purchaseRemainder.title")}>
        <LegalParagraphs
          items={[
            t("purchaseRemainder.p1"),
            t("purchaseRemainder.p2"),
            t("purchaseRemainder.p3"),
            t("purchaseRemainder.p4"),
            t("purchaseRemainder.p5"),
          ]}
        />
      </LegalSection>

      <LegalSection id="refund-operation" title={t("operationRefund.title")}>
        <LegalParagraphs
          items={[t("operationRefund.p1"), t("operationRefund.p2")]}
        />
      </LegalSection>

      <LegalSection id="refund-remedies-xor" title={t("remediesXor.title")}>
        <LegalParagraphs items={[t("remediesXor.p1"), t("remediesXor.p2")]} />
      </LegalSection>

      <LegalSection id="refund-duplicate" title={t("duplicate.title")}>
        <LegalParagraphs items={[t("duplicate.p1"), t("duplicate.p2")]} />
      </LegalSection>

      <LegalSection id="refund-unauthorized" title={t("unauthorized.title")}>
        <LegalParagraphs items={[t("unauthorized.p1"), t("unauthorized.p2")]} />
      </LegalSection>

      <LegalSection id="refund-howto" title={t("howTo.title")}>
        <p className={legal.paragraph}>
          {t.rich("howTo.p1", {
            email: legalSupportEmailTag,
          })}
        </p>
        <LegalBulletList items={asStringList(t.raw("howTo.items"))} />
        <LegalParagraphs items={[t("howTo.p2")]} />
      </LegalSection>

      <LegalSection id="refund-timing" title={t("timing.title")}>
        <LegalParagraphs items={[t("timing.p1"), t("timing.p2")]} />
      </LegalSection>

      <LegalSection id="refund-chargebacks" title={t("chargebacks.title")}>
        <LegalParagraphs items={[t("chargebacks.p1"), t("chargebacks.p2")]} />
      </LegalSection>

      <LegalSection id="refund-mandatory" title={t("mandatory.title")}>
        <LegalParagraphs items={[t("mandatory.p1")]} />
      </LegalSection>

      <LegalSection id="refund-contact" title={t("contact.title")}>
        <p className={legal.paragraph}>
          {t.rich("contact.p1", {
            email: legalSupportEmailTag,
          })}
        </p>
        <p className={legal.paragraph}>
          {t.rich("contact.p2", {
            legalInfo: legalBusinessInformationTag,
          })}
        </p>
        <p className={legal.links}>
          {t.rich("seeAlso", {
            terms: (chunks) => (
              <Link className={legal.link} href="/terms">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link className={legal.link} href="/privacy">
                {chunks}
              </Link>
            ),
            pricing: (chunks) => (
              <Link className={legal.link} href="/pricing">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </LegalSection>
    </article>
  );
}
