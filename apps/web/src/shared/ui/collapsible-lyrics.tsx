"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { mtk } from "@/shared/theme/music-track-classes";

const COLLAPSE_THRESHOLD = 30;

interface CollapsibleLyricsProps {
  text: string;
  defaultExpanded?: boolean;
}

export function CollapsibleLyrics({ text, defaultExpanded = true }: CollapsibleLyricsProps) {
  const t = useTranslations("Media");
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const canCollapse = text.length > COLLAPSE_THRESHOLD || !defaultExpanded;

  if (!canCollapse) {
    return <pre className={mtk.lyrics}>{text}</pre>;
  }

  return (
    <div className={mtk.lyricsBlockInner}>
      <div className={mtk.lyricsHeader}>
        <span className={mtk.lyricsLabel}>{t("lyricsLabel")}</span>
        {isExpanded ? (
          <button
            aria-expanded="true"
            aria-label={t("hideLyrics")}
            className={mtk.toggleLyricsButton}
            type="button"
            onClick={() => setIsExpanded(false)}
          >
            <ToggleLyricsIcon expanded />
          </button>
        ) : (
          <button
            aria-expanded="false"
            aria-label={t("showLyrics")}
            className={mtk.toggleLyricsButton}
            type="button"
            onClick={() => setIsExpanded(true)}
          >
            <ToggleLyricsIcon expanded={false} />
          </button>
        )}
      </div>
      {isExpanded ? <pre className={mtk.lyrics}>{text}</pre> : null}
    </div>
  );
}

function ToggleLyricsIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={mtk.toggleLyricsIcon}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {expanded ? (
        <>
          <path
            d="M3 3L21 21M10.58 10.58A3 3 0 0 0 12 15C13.66 15 15 13.66 15 12C15 11.29 14.74 10.65 14.32 10.17"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.75"
          />
          <path
            d="M9.88 5.1A10.94 10.94 0 0 1 12 5C17 5 21 9 21 12C21 13.12 20.69 14.17 20.15 15.07"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.75"
          />
          <path
            d="M6.61 6.61C4.61 8.16 3 10.02 3 12C3 15 7 19 12 19C13.38 19 14.68 18.68 15.82 18.15"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.75"
          />
        </>
      ) : (
        <>
          <path
            d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
          />
          <path
            d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
          />
        </>
      )}
    </svg>
  );
}
