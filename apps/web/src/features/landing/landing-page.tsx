"use client";

import { FREE_DEMO_CREDITS } from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { VoiceCreationPanel } from "@/features/voice/voice-creation-panel";
import { resolveContinueWithoutVoiceCta } from "@/features/landing/resolve-continue-without-voice-cta";
import { Link } from "@/i18n/navigation";
import { lp } from "./landing-classes";

export function LandingPage() {
  const t = useTranslations("Landing");
  const continueWithoutVoice = resolveContinueWithoutVoiceCta();

  return (
    <div className={lp.page}>
      <section className={lp.heroSection}>
        <div aria-hidden className={lp.heroGlow} />

        <p className={lp.eyebrow}>{t("eyebrow")}</p>

        <h1 className={lp.title}>
          {t.rich("hero.title", {
            highlight: (chunks) => <span className={lp.titleGradient}>{chunks}</span>,
            br: () => <br />,
          })}
        </h1>

        <p className={lp.subtitle}>{t("hero.subtitle")}</p>

        <div className={lp.voiceWrap}>
          <div className={lp.voicePathShell}>
            <div className={lp.voiceCard}>
              <VoiceCreationPanel variant="landing" />
            </div>

            <div className={lp.standardPathFork}>
              <div aria-hidden className={lp.standardPathOrRow}>
                <span className={lp.standardPathOrLine} />
                <span className={lp.standardPathOrLabel}>
                  {t("continueWithoutVoice.or")}
                </span>
                <span className={lp.standardPathOrLine} />
              </div>

              <div className={lp.standardPathCopy}>
                <p className={lp.standardPathLead}>
                  {t("continueWithoutVoice.lead")}
                </p>
                <p className={lp.standardPathHint}>
                  {t("continueWithoutVoice.hint")}
                </p>
              </div>

              <Link
                className={lp.standardPathButton}
                href={continueWithoutVoice.href}
              >
                {t("continueWithoutVoice.label")}
              </Link>
            </div>
          </div>
        </div>

        <p className={lp.note}>
          {t("demoCredits.packages", { credits: FREE_DEMO_CREDITS })}
        </p>
      </section>

      <section className={lp.ctaSection}>
        <p className={lp.ctaSubtitle}>{t("cta.subtitle")}</p>
        <div className={lp.ctaActions}>
          <Link href="/pricing" className={lp.ctaSecondary}>
            {t("cta.creditPackages")}
          </Link>
        </div>
      </section>
    </div>
  );
}
