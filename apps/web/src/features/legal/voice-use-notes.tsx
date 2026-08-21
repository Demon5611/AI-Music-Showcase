"use client";

import { useTranslations } from "next-intl";
import { legal } from "@/features/legal/legal-classes";
import { Link } from "@/i18n/navigation";

const VOICE_NOTE_KEYS = ["rights", "thirdParty", "processors", "ownership", "deletion"] as const;

/**
 * Short AI/voice clarifications near voice consent UI.
 * Does not change machine consent phrases or verify flow.
 */
export function VoiceUseNotes() {
  const t = useTranslations("Legal.voiceUse");

  return (
    <ul className={legal.voiceNotes}>
      {VOICE_NOTE_KEYS.map((key) => (
        <li key={key}>{t(key)}</li>
      ))}
      <li>
        {t.rich("privacyLink", {
          privacy: (chunks) => (
            <Link className={legal.link} href="/privacy">
              {chunks}
            </Link>
          ),
        })}
      </li>
    </ul>
  );
}
