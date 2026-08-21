"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { mtk } from "@/shared/theme/music-track-classes";
import { buildAudioDownloadFilename } from "@/shared/lib/build-audio-download-filename";
import { downloadImageFromUrl } from "@/shared/lib/download-image";

interface TrackCoverLightboxProps {
  imageUrl: string;
  title: string;
  onClose: () => void;
}

export function TrackCoverLightbox({ imageUrl, title, onClose }: TrackCoverLightboxProps) {
  const t = useTranslations("Media");
  const tCommon = useTranslations("Common");
  const tErrors = useTranslations("Errors");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  async function handleDownload() {
    setIsDownloading(true);
    setDownloadError(null);

    try {
      await downloadImageFromUrl(
        imageUrl,
        buildAudioDownloadFilename(title, "jpg"),
      );
    } catch {
      setDownloadError(tErrors("coverDownloadFailed"));
    } finally {
      setIsDownloading(false);
    }
  }

  return createPortal(
    <div
      aria-label={t("coverViewer")}
      className={mtk.coverLightboxBackdrop}
      role="dialog"
      onClick={onClose}
    >
      <div className={mtk.coverLightboxToolbar}>
        <button
          className={mtk.coverLightboxDownload}
          disabled={isDownloading}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleDownload();
          }}
        >
          {isDownloading ? tCommon("downloading") : t("downloadCover")}
        </button>
        <button
          aria-label={tCommon("close")}
          className={mtk.coverLightboxClose}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      </div>

      <img
        alt={t("coverAlt", { title })}
        className={mtk.coverLightboxImage}
        src={imageUrl}
        onClick={(event) => event.stopPropagation()}
      />

      {downloadError ? <p className={mtk.error}>{downloadError}</p> : null}
    </div>,
    document.body,
  );
}
