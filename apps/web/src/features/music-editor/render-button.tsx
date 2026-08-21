"use client";

import type { SongVersionDto } from "@ai-music/shared";
import { OPERATION_COST_UNITS, formatCreditsFromUnits } from "@ai-music/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useInvalidateCreditsBalance } from "@/features/billing/hooks/invalidate-credits-balance";
import { DownloadAudioButton } from "@/features/music-editor/download-audio-button";
import { me } from "@/features/music-editor/music-editor-classes";
import { Link } from "@/i18n/navigation";
import { parseApiError } from "@/shared/lib/parse-api-error";
import { useApi } from "@/shared/providers/api-provider";
import { AudioPreviewPlayer } from "@/shared/ui/elevenlabs";
import { PlanGatedWrap } from "@/shared/ui/plan-gated";
import { Tooltip } from "@/shared/ui/tooltip";

interface RenderButtonProps {
  disabled: boolean;
  isRendering: boolean;
  renderError: string | null;
  songId: string;
  songTitle: string;
  sourceTrackId: string | null;
  sourceLyricsText: string | null;
  musicProvider?: string | null;
  versions: SongVersionDto[];
  onRender: () => void;
}

export function RenderButton({
  disabled,
  isRendering,
  renderError,
  songId,
  songTitle,
  sourceTrackId,
  sourceLyricsText,
  musicProvider,
  versions,
  onRender,
}: RenderButtonProps) {
  const t = useTranslations("Editor.export");
  const tErrors = useTranslations("Errors");
  const api = useApi();
  const invalidateCreditsBalance = useInvalidateCreditsBalance();
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [wavExportError, setWavExportError] = useState<string | null>(null);
  const [wavAudioUrl, setWavAudioUrl] = useState<string | null>(null);
  const [wavVersionNumber, setWavVersionNumber] = useState<number | null>(null);

  const latestRendered = versions.find(
    (version) => version.status === "completed" && version.renderedAudioUrl,
  );
  const latestFailedRender = versions.find((version) => version.status === "failed");
  const hasCompletedRender = Boolean(latestRendered?.renderedAudioUrl);
  const wavCostUnits = OPERATION_COST_UNITS.wavExport;
  const wavCostLabel = formatCreditsFromUnits(wavCostUnits);
  const wavIsFree = wavCostUnits <= 0;

  useEffect(() => {
    setWavAudioUrl(null);
    setWavVersionNumber(null);
    setWavExportError(null);
  }, [latestRendered?.id]);

  async function handleExportWav() {
    if (!latestRendered) {
      return;
    }

    setIsExportingWav(true);
    setWavExportError(null);

    try {
      const result = await api.musicEditor.exportWav(songId, {
        versionId: latestRendered.id,
      });

      setWavAudioUrl(result.wavAudioUrl);
      setWavVersionNumber(result.versionNumber);

      if (!result.cached) {
        await invalidateCreditsBalance();
      }
    } catch (error) {
      setWavExportError(
        parseApiError(error, tErrors("editorWavExportFailed"), {
          preferFallback: true,
        }),
      );
    } finally {
      setIsExportingWav(false);
    }
  }

  return (
    <div className={me.panel}>
      <h3 className={me.panelTitle}>{t("title")}</h3>
      <p className={me.panelHint}>{t("hint")}</p>

      <Tooltip content={t("renderTooltip")}>
        <button
          className={me.primaryButton}
          disabled={disabled || isRendering}
          type="button"
          onClick={onRender}
        >
          {isRendering ? t("rendering") : t("render")}
        </button>
      </Tooltip>

      {isRendering ? <p className={me.renderStatus}>{t("buildingMp3")}</p> : null}

      {renderError ? <p className={me.error}>{renderError}</p> : null}

      {!isRendering && !hasCompletedRender && !renderError ? (
        <p className={me.renderStatus}>{t("noVersions")}</p>
      ) : null}

      {!isRendering && latestFailedRender && !hasCompletedRender && !renderError ? (
        <p className={me.renderStatus}>
          {t("lastFailed", { version: latestFailedRender.versionNumber })}
        </p>
      ) : null}

      {latestRendered?.renderedAudioUrl ? (
        <div className={me.renderResult}>
          <p className={me.renderStatus}>
            {t("versionReady", { version: latestRendered.versionNumber })}
          </p>
          <AudioPreviewPlayer
            className={me.player}
            karaoke={{
              trackId: sourceTrackId ?? undefined,
              musicProvider,
              defaultExpanded: false,
              lyricsText: sourceLyricsText,
            }}
            src={latestRendered.renderedAudioUrl}
          />
          <Tooltip content={t("downloadMp3Tooltip")}>
            <DownloadAudioButton
              audioUrl={latestRendered.renderedAudioUrl}
              className={me.toolButton}
              filename={`${songTitle}-v${latestRendered.versionNumber}.mp3`}
              label={t("downloadMp3")}
            />
          </Tooltip>

          <div className={me.toolbarRow}>
            <PlanGatedWrap feature="wavExport">
              <Tooltip content={t("wavTooltip")}>
                <button
                  className={me.toolButton}
                  disabled={disabled || isExportingWav}
                  type="button"
                  onClick={() => void handleExportWav()}
                >
                  {isExportingWav
                    ? t("exportingWav")
                    : wavIsFree
                      ? t("exportWavFree")
                      : t("exportWav", { cost: wavCostLabel })}
                </button>
              </Tooltip>
            </PlanGatedWrap>
          </div>

          <p className={me.panelHint}>{t("formatsHint")}</p>

          {wavExportError ? <p className={me.error}>{wavExportError}</p> : null}

          {wavAudioUrl && wavVersionNumber !== null ? (
            <Tooltip content={t("downloadWavTooltip")}>
              <DownloadAudioButton
                audioUrl={wavAudioUrl}
                className={me.toolButton}
                filename={`${songTitle}-v${wavVersionNumber}.wav`}
                label={t("downloadWav")}
              />
            </Tooltip>
          ) : null}
        </div>
      ) : (
        <p className={me.panelHint}>
          {t.rich("wavStudioOnly", {
            pricing: (chunks) => (
              <Link
                className="text-violet-300 underline underline-offset-2"
                href="/pricing"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </div>
  );
}
