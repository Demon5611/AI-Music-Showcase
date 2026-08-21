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

export function TermsPanel() {
  const t = useTranslations("Legal.terms");

  return (
    <article className={legal.page}>
      <h1 className={legal.title}>{t("title")}</h1>
      <p className={legal.lead}>{t("lead")}</p>
      <LegalEffectiveDate document="terms" />

      <LegalSection id="terms-intro" title={t("intro.title")}>
        <LegalParagraphs items={[t("intro.p1"), t("intro.p2")]} />
      </LegalSection>

      <LegalSection id="terms-operator" title={t("operator.title")}>
        <LegalParagraphs items={[t("operator.p1")]} />
        <p className={legal.paragraph}>
          {t.rich("operator.p2", {
            legalInfo: legalBusinessInformationTag,
            email: legalSupportEmailTag,
          })}
        </p>
      </LegalSection>

      <LegalSection id="terms-service" title={t("service.title")}>
        <LegalParagraphs items={[t("service.p1"), t("service.p2")]} />
      </LegalSection>

      <LegalSection id="terms-credits" title={t("credits.title")}>
        <LegalParagraphs
          items={[t("credits.p1"), t("credits.p2"), t("credits.p3"), t("credits.p4")]}
        />
        <LegalBulletList items={asStringList(t.raw("credits.items"))} />
      </LegalSection>

      <LegalSection id="terms-payment" title={t("payment.title")}>
        <LegalParagraphs items={[t("payment.p1"), t("payment.p2"), t("payment.p3")]} />
      </LegalSection>

      <LegalSection id="terms-ai" title={t("aiOutput.title")}>
        <LegalParagraphs
          items={[t("aiOutput.p1"), t("aiOutput.p2"), t("aiOutput.p3")]}
        />
      </LegalSection>

      <LegalSection id="terms-voice" title={t("voice.title")}>
        <LegalParagraphs items={[t("voice.p1")]} />
        <LegalBulletList items={asStringList(t.raw("voice.items"))} />
        <LegalParagraphs
          items={[t("voice.p2"), t("voice.p3"), t("voice.p4"), t("voice.p5")]}
        />
      </LegalSection>

      <LegalSection id="terms-failed" title={t("failedOps.title")}>
        <LegalParagraphs items={[t("failedOps.p1")]} />
        <p className={legal.links}>
          {t.rich("failedOps.seeRefund", {
            refund: (chunks) => (
              <Link className={legal.link} href="/refund">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </LegalSection>

      <LegalSection id="terms-availability" title={t("availability.title")}>
        <LegalParagraphs items={[t("availability.p1"), t("availability.p2")]} />
      </LegalSection>

      <LegalSection id="terms-children" title={t("children.title")}>
        <LegalParagraphs items={[t("children.p1")]} />
      </LegalSection>

      <LegalSection id="terms-changes" title={t("changes.title")}>
        <LegalParagraphs items={[t("changes.p1")]} />
      </LegalSection>

      <LegalSection id="terms-contact" title={t("contact.title")}>
        <p className={legal.paragraph}>
          {t.rich("contact.p1", {
            email: legalSupportEmailTag,
          })}
        </p>
        <p className={legal.links}>
          {t.rich("seeAlso", {
            privacy: (chunks) => (
              <Link className={legal.link} href="/privacy">
                {chunks}
              </Link>
            ),
            refund: (chunks) => (
              <Link className={legal.link} href="/refund">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </LegalSection>
    </article>
  );
}
