"use client";

import { useTranslations } from "next-intl";
import { isTimedLyricsAvailableForProvider } from "@ai-music/shared";
import { CollapsibleLyrics } from "@/shared/ui/collapsible-lyrics";
import {
  KaraokeLyricsView,
  KaraokeToggle,
  KaraokeUpgradeHint,
} from "@/shared/ui/karaoke/karaoke-lyrics-view";
import { karaokeUi } from "@/shared/ui/karaoke/karaoke-classes";
import { useKaraokeEnabled } from "@/shared/hooks/use-karaoke-enabled";
import {
  useFetchTimedLyricsMutation,
  useTimedLyricsCache,
} from "@/shared/hooks/use-timed-lyrics";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { parseApiError } from "@/shared/lib/parse-api-error";
import { ShimmeringText } from "@/components/ui/shimmering-text";

interface TrackKaraokeSectionProps {
  trackId?: string;
  /** Persisted generation/song provider — never MUSIC_DEFAULT_PROVIDER. */
  musicProvider?: string | null;
  lyricsText?: string | null;
  currentTimeSec: number;
  defaultExpanded?: boolean;
}

export function TrackKaraokeSection({
  trackId,
  musicProvider,
  lyricsText,
  currentTimeSec,
  defaultExpanded = true,
}: TrackKaraokeSectionProps) {
  const t = useTranslations("Karaoke");
  const tErrors = useTranslations("Errors");
  const { enabled, setEnabled } = useKaraokeEnabled();
  const subscriptionQuery = useSubscriptionQuery();
  const canUseKaraoke =
    subscriptionQuery.data?.entitlements.features.karaokeSync === true;
  const hasLyrics = Boolean(lyricsText?.trim());
  const capabilityAvailable = isTimedLyricsAvailableForProvider(musicProvider);
  const cacheQueryEnabled =
    Boolean(trackId) && enabled && canUseKaraoke && hasLyrics && capabilityAvailable;

  const timedLyricsQuery = useTimedLyricsCache(trackId, cacheQueryEnabled);
  const fetchMutation = useFetchTimedLyricsMutation(trackId);

  if (!hasLyrics) {
    return null;
  }

  const handleToggle = () => {
    setEnabled(!enabled);
  };

  const handleSync = () => {
    if (!trackId || fetchMutation.isPending) {
      return;
    }

    fetchMutation.mutate();
  };

  const cache = timedLyricsQuery.data;
  const showKaraokeBody = enabled && canUseKaraoke;

  return (
    <div className={karaokeUi.section}>
      <div className={karaokeUi.header}>
        <span className={karaokeUi.label}>{t("lyricsLabel")}</span>
        <KaraokeToggle
          canUseKaraoke={canUseKaraoke}
          disabled={!trackId}
          enabled={enabled}
          onToggle={handleToggle}
        />
      </div>

      {!canUseKaraoke ? <KaraokeUpgradeHint /> : null}

      {showKaraokeBody ? (
        !capabilityAvailable ? (
          <p className={karaokeUi.status}>{t("unavailableForProvider")}</p>
        ) : timedLyricsQuery.isLoading ? (
          <ShimmeringText className={karaokeUi.status} text={t("syncing")} />
        ) : timedLyricsQuery.isError ? (
          <p className={karaokeUi.error}>
            {parseApiError(timedLyricsQuery.error, tErrors("karaokeLoadFailed"), {
              preferFallback: true,
            })}
          </p>
        ) : cache?.kind === "unavailable" ? (
          <p className={karaokeUi.status}>{t("unavailableForProvider")}</p>
        ) : cache?.kind === "miss" ? (
          <div className={karaokeUi.statusBlock}>
            <p className={karaokeUi.status}>{t("cacheMissHint")}</p>
            <button
              className={karaokeUi.syncButton}
              disabled={fetchMutation.isPending || !trackId}
              type="button"
              onClick={handleSync}
            >
              {fetchMutation.isPending ? t("syncing") : t("syncAction")}
            </button>
            {fetchMutation.isError ? (
              <p className={karaokeUi.error}>
                {parseApiError(fetchMutation.error, tErrors("karaokeLoadFailed"), {
                  preferFallback: true,
                })}
              </p>
            ) : null}
          </div>
        ) : cache?.kind === "cached" && cache.data.lines.length ? (
          <KaraokeLyricsView
            currentTimeSec={currentTimeSec}
            lines={cache.data.lines}
            words={cache.data.words}
          />
        ) : (
          <p className={karaokeUi.status}>{t("unavailable")}</p>
        )
      ) : (
        <CollapsibleLyrics defaultExpanded={defaultExpanded} text={lyricsText ?? ""} />
      )}
    </div>
  );
}
