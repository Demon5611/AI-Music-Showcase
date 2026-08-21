"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { TimedLyricsLine, TimedLyricsWord } from "@ai-music/shared";
import {
  expandTimedLyricsLines,
  groupWordsToDisplayLines,
  isTimedLyricsSectionMarker,
  resolveTimedWordState,
} from "@ai-music/shared";
import { karaokeUi } from "@/shared/ui/karaoke/karaoke-classes";
import { cn } from "@/lib/utils";

interface KaraokeLyricsViewProps {
  lines: TimedLyricsLine[];
  words?: TimedLyricsWord[];
  currentTimeSec: number;
}

function KaraokeLineLyricsView({
  lines,
  currentTimeSec,
}: {
  lines: TimedLyricsLine[];
  currentTimeSec: number;
}) {
  const displayLines = useMemo(() => expandTimedLyricsLines(lines), [lines]);

  return (
    <div className={karaokeUi.lines}>
      {displayLines.map((line, index) => {
        if (isTimedLyricsSectionMarker(line.text)) {
          return (
            <p
              key={`line-${index}-${line.text}`}
              className={karaokeUi.sectionMarker}
            >
              {line.text}
            </p>
          );
        }

        const isActive =
          currentTimeSec >= line.startSec &&
          (index === displayLines.length - 1
            ? currentTimeSec <= line.endSec + 0.25
            : currentTimeSec < line.endSec);

        return (
          <p
            key={`line-${index}-${line.text}`}
            className={cn(karaokeUi.line, isActive ? karaokeUi.lineActive : undefined)}
          >
            {line.text}
          </p>
        );
      })}
    </div>
  );
}

function KaraokeWordLyricsView({
  words,
  currentTimeSec,
}: {
  words: TimedLyricsWord[];
  currentTimeSec: number;
}) {
  const displayLines = useMemo(() => groupWordsToDisplayLines(words), [words]);

  return (
    <div className={karaokeUi.lines}>
      {displayLines.map((line, lineIndex) => {
        const isSectionLabel =
          line.words.length === 1 && isTimedLyricsSectionMarker(line.words[0]?.text ?? "");

        if (isSectionLabel) {
          return (
            <p
              key={`word-line-${lineIndex}-${line.words[0]?.text}`}
              className={karaokeUi.sectionMarker}
            >
              {line.words[0]?.text}
            </p>
          );
        }

        const isLineActive =
          currentTimeSec >= line.startSec && currentTimeSec < line.endSec + 0.05;

        return (
          <p
            key={`word-line-${lineIndex}-${line.words.map((word) => word.text).join("-")}`}
            className={cn(
              karaokeUi.wordLine,
              isLineActive ? karaokeUi.wordLineActive : undefined,
            )}
          >
            {line.words.map((word, wordIndex) => {
              const state = resolveTimedWordState(word, currentTimeSec);

              return (
                <span
                  key={`${word.startSec}-${word.endSec}-${word.text}-${wordIndex}`}
                  className={cn(
                    karaokeUi.word,
                    state === "past"
                      ? karaokeUi.wordPast
                      : state === "active"
                        ? karaokeUi.wordActive
                        : karaokeUi.wordUpcoming,
                  )}
                >
                  {word.text}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

export function KaraokeLyricsView({ lines, words, currentTimeSec }: KaraokeLyricsViewProps) {
  if (words && words.length > 0) {
    return <KaraokeWordLyricsView currentTimeSec={currentTimeSec} words={words} />;
  }

  return <KaraokeLineLyricsView currentTimeSec={currentTimeSec} lines={lines} />;
}

interface KaraokeToggleProps {
  enabled: boolean;
  canUseKaraoke: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

export function KaraokeToggle({
  enabled,
  canUseKaraoke,
  disabled,
  onToggle,
}: KaraokeToggleProps) {
  const t = useTranslations("Karaoke");
  const isDisabled = disabled || !canUseKaraoke;
  const label = enabled ? t("toggleOn") : t("toggleOff");
  const className = cn(
    karaokeUi.toggleButton,
    enabled && canUseKaraoke ? karaokeUi.toggleButtonActive : undefined,
    isDisabled ? karaokeUi.toggleButtonDisabled : undefined,
  );
  const title = canUseKaraoke ? undefined : t("upgradeTitle");

  if (enabled) {
    return (
      <button
        aria-pressed="true"
        className={className}
        disabled={isDisabled}
        title={title}
        type="button"
        onClick={onToggle}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      aria-pressed="false"
      className={className}
      disabled={isDisabled}
      title={title}
      type="button"
      onClick={onToggle}
    >
      {label}
    </button>
  );
}

export function KaraokeUpgradeHint() {
  const t = useTranslations("Karaoke");

  return (
    <p className={karaokeUi.status}>
      {t("upgradeTitle")}.{" "}
      <Link className={karaokeUi.upgradeLink} href="/pricing">
        {t("packagesLink")}
      </Link>
    </p>
  );
}
