"use client";

import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { MusicHistoryPanel } from "@/features/music-history/music-history-panel";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { mp } from "@/shared/theme/music-page-classes";
import { useAuthReady } from "@/shared/hooks/use-auth-ready";
import { useApi } from "@/shared/providers/api-provider";
import { buildApiErrorTranslations, parseApiError } from "@/shared/lib/parse-api-error";
import { RequireAuth } from "@/shared/ui/require-auth";

function IconClock() {
  return (
    <svg
      aria-hidden="true"
      className={mp.icon}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MusicHistoryPage() {
  const t = useTranslations("History");

  return (
    <RequireAuth hint={t("authHint")} title={t("authTitle")}>
      <MusicHistoryPageContent />
    </RequireAuth>
  );
}

function MusicHistoryPageContent() {
  const api = useApi();
  const authReady = useAuthReady();
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations("History");
  const tErrors = useTranslations("Errors");
  const subscriptionQuery = useSubscriptionQuery();
  const errorTranslations = buildApiErrorTranslations(tErrors);

  const [error, setError] = useState<string | null>(null);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [isDeletingTrack, setIsDeletingTrack] = useState(false);
  const [openingEditorTrackId, setOpeningEditorTrackId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["music-history"],
    queryFn: () => api.music.history(),
    enabled: authReady,
  });

  const maxProjects = subscriptionQuery.data?.entitlements.maxProjects;
  const historyItems = historyQuery.data ?? [];
  const historyAtLimit =
    maxProjects !== undefined && historyItems.length >= maxProjects && maxProjects > 0;

  async function refreshHistory() {
    await queryClient.invalidateQueries({ queryKey: ["music-history"] });
  }

  async function handleDeleteHistory(ids: string[]) {
    setIsDeletingHistory(true);
    setError(null);

    try {
      await api.music.deleteHistory(ids);
      await refreshHistory();
    } catch (deleteError) {
      setError(
        parseApiError(deleteError, tErrors("historyDeleteFailed"), {
          includeUnauthorized: true,
          translations: errorTranslations,
        }),
      );
    } finally {
      setIsDeletingHistory(false);
    }
  }

  async function handleDeleteTrack(trackId: string) {
    setIsDeletingTrack(true);
    setError(null);

    try {
      await api.music.deleteTrack(trackId);
      await refreshHistory();
    } catch (deleteError) {
      setError(
        parseApiError(deleteError, tErrors("trackDeleteFailed"), {
          includeUnauthorized: true,
          translations: errorTranslations,
        }),
      );
    } finally {
      setIsDeletingTrack(false);
    }
  }

  async function handleOpenEditor(trackId: string) {
    setOpeningEditorTrackId(trackId);
    setError(null);

    try {
      const result = await api.musicEditor.initEditor(trackId);
      router.push(`/music-editor/${result.songId}`);
    } catch (editorError) {
      setError(
        parseApiError(editorError, tErrors("openEditorFailed"), {
          includeUnauthorized: true,
          translations: errorTranslations,
        }),
      );
    } finally {
      setOpeningEditorTrackId(null);
    }
  }

  return (
    <div className={mp.page}>
      <header className={mp.pageHeader}>
        <div className={mp.pageHeaderBrand}>
          <div className={mp.pageHeaderLogo}>
            <IconClock />
          </div>
          <span className={mp.pageHeaderTitle}>{t("pageTitle")}</span>
        </div>
        <Link className={mp.pageHeaderMeta} href="/music-create">
          {t("createLink")}
        </Link>
      </header>

      <main className={mp.pageMain}>
        {historyQuery.error ? (
          <div className={mp.alertError} role="alert">
            {parseApiError(historyQuery.error, tErrors("historyLoadFailed"), {
              includeUnauthorized: true,
              translations: errorTranslations,
            })}
          </div>
        ) : null}

        {error ? (
          <div className={mp.alertError} role="alert">
            {error}
          </div>
        ) : null}

        {historyAtLimit ? (
          <div className={mp.alertWarning} role="status">
            {t("limitNotice", { count: maxProjects })}{" "}
            <Link className="underline underline-offset-2" href="/pricing">
              {t("limitNoticeLink")}
            </Link>
            {t("limitNoticeSuffix")}
          </div>
        ) : null}

        <section className={mp.sectionCard}>
          <MusicHistoryPanel
            isDeleting={isDeletingHistory || isDeletingTrack}
            isLoading={historyQuery.isLoading}
            items={historyItems}
            openingEditorTrackId={openingEditorTrackId}
            onDelete={handleDeleteHistory}
            onDeleteTrack={handleDeleteTrack}
            onOpenEditor={(id) => void handleOpenEditor(id)}
          />
        </section>
      </main>
    </div>
  );
}
