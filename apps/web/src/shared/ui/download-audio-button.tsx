"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { createDevAuthToken, env } from "@/shared/config/env";
import { downloadAuthenticatedBlob } from "@/shared/lib/fetch-authenticated-media";
import { parseApiError } from "@/shared/lib/parse-api-error";
import { appShell } from "@/shared/theme/app-theme";

interface DownloadAudioButtonProps {
  audioUrl: string;
  filename: string;
  label?: string;
  className?: string;
}

function DownloadAudioButtonContent({
  audioUrl,
  filename,
  label,
  className,
  getToken,
}: DownloadAudioButtonProps & {
  getToken: () => Promise<string | null>;
}) {
  const t = useTranslations("Common");
  const tErrors = useTranslations("Errors");
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonClassName = className ?? appShell.btnSecondaryOutline;

  async function handleDownload() {
    setIsDownloading(true);
    setError(null);

    try {
      await downloadAuthenticatedBlob(audioUrl, filename, getToken);
    } catch (downloadError) {
      setError(
        parseApiError(downloadError, tErrors("downloadFailed"), {
          preferFallback: true,
        }),
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <button
        className={buttonClassName}
        disabled={isDownloading}
        type="button"
        onClick={() => void handleDownload()}
      >
        {isDownloading ? t("downloading") : label}
      </button>
      {error ? <p className={appShell.formError}>{error}</p> : null}
    </>
  );
}

function ClerkDownloadButton(props: DownloadAudioButtonProps) {
  const { getToken } = useAuth();

  return <DownloadAudioButtonContent {...props} getToken={getToken} />;
}

function DevDownloadButton(props: DownloadAudioButtonProps) {
  return (
    <DownloadAudioButtonContent
      {...props}
      getToken={async () => createDevAuthToken()}
    />
  );
}

export function DownloadAudioButton(props: DownloadAudioButtonProps) {
  const t = useTranslations("Common");
  const label = props.label ?? t("download");

  if (env.isClerkEnabled) {
    return <ClerkDownloadButton {...props} label={label} />;
  }

  return <DevDownloadButton {...props} label={label} />;
}
