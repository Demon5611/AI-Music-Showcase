"use client";

import type { GenerationJob } from "@ai-music/shared";
import { parseApiError } from "@/shared/lib/parse-api-error";
import { isGenerationTerminal } from "@/entities/generation-job";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuthReady } from "@/shared/hooks/use-auth-ready";
import { usePollingQuery } from "@/shared/hooks/use-polling-query";
import { useApi } from "@/shared/providers/api-provider";
import { appShell } from "@/shared/theme/app-theme";
import {
  AiProcessingStatus,
  isGenerationInProgress,
  LoadingPanel,
  resolveGenerationProgress,
} from "@/shared/ui/elevenlabs";
import { RequireAuth } from "@/shared/ui/require-auth";

interface GenerationStatusPanelProps {
  jobId: string;
}

type GenerationStatus = GenerationJob["status"];

function resolveFailedJobMessage(
  message: string,
  locale: string,
  fallback: string,
): string {
  if ((locale === "en" || locale === "ka") && /[А-Яа-яЁё]/.test(message)) {
    return fallback;
  }

  return message;
}

function useGenerationStatusLabel() {
  const t = useTranslations("Generation.status");

  return (status: GenerationStatus) => t(status);
}

export function GenerationStatusPanel({ jobId }: GenerationStatusPanelProps) {
  const t = useTranslations("Generation");

  return (
    <RequireAuth
      hint={t("authHint")}
      loadingFallback={
        <section className={appShell.formPage}>
          <LoadingPanel />
        </section>
      }
      title={t("authTitle")}
    >
      <GenerationStatusPanelContent jobId={jobId} />
    </RequireAuth>
  );
}

function GenerationStatusPanelContent({ jobId }: GenerationStatusPanelProps) {
  const t = useTranslations("Generation");
  const tErrors = useTranslations("Errors");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const statusLabel = useGenerationStatusLabel();
  const api = useApi();
  const authReady = useAuthReady();

  const jobQuery = usePollingQuery({
    queryKey: ["generations", jobId],
    queryFn: () => api.generations.get(jobId),
    enabled: authReady,
    isTerminal: (job) => Boolean(job && isGenerationTerminal(job.status)),
    intervalMs: 3000,
  });

  if (jobQuery.isLoading) {
    return (
      <section className={appShell.formPage}>
        <h1 className={appShell.formPageTitle}>{t("pageTitle")}</h1>
        <LoadingPanel />
      </section>
    );
  }

  if (jobQuery.error) {
    return (
      <section className={appShell.formPage}>
        <h1 className={appShell.formPageTitle}>{t("pageTitle")}</h1>
        <p className={appShell.formError}>
          {parseApiError(jobQuery.error, tErrors("generationLoadFailed"), {
            preferFallback: true,
          })}
        </p>
      </section>
    );
  }

  const job = jobQuery.data;

  if (!job) {
    return null;
  }

  const inProgress = isGenerationInProgress(job.status);
  const label = statusLabel(job.status);

  return (
    <section className={appShell.formPage}>
      <h1 className={appShell.formPageTitle}>{t("pageTitle")}</h1>
      <p className={appShell.formMeta}>{t("jobId", { id: job.id })}</p>

      {inProgress ? (
        <AiProcessingStatus
          agentState="thinking"
          label={label}
          meta={t("pollingMeta")}
          progress={resolveGenerationProgress(job.status)}
        />
      ) : (
        <p className={appShell.formMeta}>
          {tCommon("statusLabel", { status: label })}
        </p>
      )}

      {job.status === "failed" && job.errorMessage ? (
        <p className={appShell.formError}>
          {resolveFailedJobMessage(job.errorMessage, locale, tErrors("generic"))}
        </p>
      ) : null}

      {job.status === "completed" && job.trackId ? (
        <div className={appShell.formField}>
          <Link className={appShell.formSubmit} href={`/track/${job.trackId}`}>
            {t("openTrack")}
          </Link>
        </div>
      ) : null}

      <Link className={appShell.formHint} href="/profile">
        {t("backToProfile")}
      </Link>
    </section>
  );
}
