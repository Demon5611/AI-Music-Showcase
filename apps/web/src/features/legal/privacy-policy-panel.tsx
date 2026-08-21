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

export function PrivacyPolicyPanel() {
  const t = useTranslations("Legal.privacy");

  return (
    <article className={legal.page}>
      <h1 className={legal.title}>{t("title")}</h1>
      <p className={legal.lead}>{t("lead")}</p>
      <LegalEffectiveDate document="privacy" />

      <LegalSection id="privacy-who" title={t("whoWeAre.title")}>
        <LegalParagraphs items={[t("whoWeAre.p1")]} />
        <p className={legal.paragraph}>
          {t.rich("whoWeAre.p2", {
            legalInfo: legalBusinessInformationTag,
          })}
        </p>
        <p className={legal.paragraph}>
          {t.rich("whoWeAre.p3", {
            email: legalSupportEmailTag,
          })}
        </p>
      </LegalSection>

      <LegalSection id="privacy-scope" title={t("scope.title")}>
        <LegalParagraphs items={[t("scope.p1")]} />
        <LegalBulletList items={asStringList(t.raw("scope.items"))} />
      </LegalSection>

      <LegalSection id="privacy-data" title={t("dataWeCollect.title")}>
        <h3 className={legal.subsectionTitle}>{t("dataWeCollect.accountTitle")}</h3>
        <LegalParagraphs items={[t("dataWeCollect.accountIntro")]} />
        <LegalBulletList items={asStringList(t.raw("dataWeCollect.accountItems"))} />
        <LegalParagraphs items={[t("dataWeCollect.accountNote")]} />

        <h3 className={legal.subsectionTitle}>{t("dataWeCollect.contentTitle")}</h3>
        <LegalBulletList items={asStringList(t.raw("dataWeCollect.contentItems"))} />

        <h3 className={legal.subsectionTitle}>{t("dataWeCollect.technicalTitle")}</h3>
        <LegalBulletList items={asStringList(t.raw("dataWeCollect.technicalItems"))} />
        <LegalParagraphs items={[t("dataWeCollect.technicalNote")]} />

        <h3 className={legal.subsectionTitle}>{t("dataWeCollect.paymentTitle")}</h3>
        <LegalParagraphs
          items={[
            t("dataWeCollect.paymentP1"),
            t("dataWeCollect.paymentP2"),
            t("dataWeCollect.paymentP3"),
          ]}
        />
      </LegalSection>

      <LegalSection id="privacy-purposes" title={t("purposes.title")}>
        <LegalParagraphs items={[t("purposes.p1")]} />
        <LegalBulletList items={asStringList(t.raw("purposes.items"))} />
        <LegalParagraphs items={[t("purposes.p2"), t("purposes.p3")]} />
      </LegalSection>

      <LegalSection id="privacy-grounds" title={t("grounds.title")}>
        <LegalParagraphs items={[t("grounds.p1"), t("grounds.p2"), t("grounds.p3")]} />
      </LegalSection>

      <LegalSection id="privacy-ai" title={t("aiVoice.title")}>
        <LegalParagraphs
          items={[
            t("aiVoice.p1"),
            t("aiVoice.p2"),
            t("aiVoice.p3"),
            t("aiVoice.p4"),
            t("aiVoice.p5"),
            t("aiVoice.p6"),
            t("aiVoice.p7"),
            t("aiVoice.p8"),
            t("aiVoice.p9"),
          ]}
        />
      </LegalSection>

      <LegalSection id="privacy-providers" title={t("providers.title")}>
        <LegalParagraphs items={[t("providers.p1")]} />
        <LegalBulletList items={asStringList(t.raw("providers.items"))} />
        <LegalParagraphs
          items={[t("providers.p2"), t("providers.p3"), t("providers.p4")]}
        />
      </LegalSection>

      <LegalSection id="privacy-retention" title={t("retention.title")}>
        <LegalParagraphs
          items={[
            t("retention.p1"),
            t("retention.p2"),
            t("retention.p3"),
            t("retention.p4"),
            t("retention.p5"),
            t("retention.p6"),
          ]}
        />
      </LegalSection>

      <LegalSection id="privacy-security" title={t("security.title")}>
        <LegalParagraphs items={[t("security.p1"), t("security.p2"), t("security.p3")]} />
      </LegalSection>

      <LegalSection id="privacy-rights" title={t("rights.title")}>
        <LegalParagraphs items={[t("rights.p1"), t("rights.p2")]} />
      </LegalSection>

      <LegalSection id="privacy-deletion" title={t("deletion.title")}>
        <LegalParagraphs
          items={[
            t("deletion.p1"),
            t("deletion.p2"),
            t("deletion.p3"),
            t("deletion.p4"),
            t("deletion.p5"),
          ]}
        />
      </LegalSection>

      <LegalSection id="privacy-children" title={t("children.title")}>
        <LegalParagraphs items={[t("children.p1")]} />
      </LegalSection>

      <LegalSection id="privacy-changes" title={t("changes.title")}>
        <LegalParagraphs items={[t("changes.p1")]} />
      </LegalSection>

      <LegalSection id="privacy-contact" title={t("contact.title")}>
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
