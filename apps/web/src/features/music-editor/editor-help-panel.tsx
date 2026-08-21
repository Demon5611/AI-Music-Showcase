"use client";

import { useHintsVisibility } from "@/shared/providers/hints-visibility-provider";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { me } from "@/features/music-editor/music-editor-classes";

export function EditorHelpPanel() {
  const t = useTranslations("Editor.help");
  const { hintsVisible } = useHintsVisibility();
  const [open, setOpen] = useState(false);

  if (!hintsVisible) {
    return null;
  }

  return (
    <div className={me.helpPanel}>
      <button
        className={me.helpToggle}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {t("toggle")}
      </button>
      {open ? (
        <ol className={me.helpList}>
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
          <li>{t("step4")}</li>
          <li>{t("step5")}</li>
        </ol>
      ) : null}
    </div>
  );
}
