"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  canRequestAlbumCoverVariants,
  isAlbumCoverGenerationReady,
} from "@ai-music/shared";
import { mtk } from "@/shared/theme/music-track-classes";
import { TrackCoverImage } from "@/shared/ui/track-cover/track-cover-image";
import { TrackCoverLightbox } from "@/shared/ui/track-cover/track-cover-lightbox";
import { useApi } from "@/shared/providers/api-provider";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { parseApiError } from "@/shared/lib/parse-api-error";
import { cn } from "@/lib/utils";

interface GenerationAlbumCoverSectionProps {
  generationId?: string;
  /** MusicGeneration.status from status/history DTO. */
  generationStatus?: string | null;
  /** At least one stored/playable track — required when status is still `processing`. */
  hasReadyTracks?: boolean;
  title: string;
  /**
   * MusicGeneration.provider from the completed record (not the current My Voice toggle).
   * sunoapi → cover variants CTA; mureka → initials fallback only.
   */
  musicProvider?: string | null;
  defaultImageUrl?: string | null;
  albumCoverImages?: string[];
  selectedAlbumCoverUrl?: string | null;
  onCoverUpdated?: (imageUrl: string | null, images: string[]) => void;
}

function buildVariantOptions(
  defaultImageUrl: string | null | undefined,
  albumCoverImages: string[],
): string[] {
  const values = [defaultImageUrl, ...albumCoverImages].filter(
    (value): value is string => Boolean(value?.trim()),
  );

  return [...new Set(values)];
}

export function GenerationAlbumCoverSection({
  generationId,
  generationStatus,
  hasReadyTracks = false,
  title,
  musicProvider,
  defaultImageUrl,
  albumCoverImages = [],
  selectedAlbumCoverUrl,
  onCoverUpdated,
}: GenerationAlbumCoverSectionProps) {
  const t = useTranslations("MusicCreate.cover");
  const tErrors = useTranslations("Errors");
  const api = useApi();
  const queryClient = useQueryClient();
  const subscriptionQuery = useSubscriptionQuery();
  const entitlementAllowsCover =
    subscriptionQuery.data?.entitlements.features.albumCover === true;
  const variantsSupported = canRequestAlbumCoverVariants(musicProvider);
  const generationReady = isAlbumCoverGenerationReady({
    status: generationStatus,
    hasReadyTracks,
  });
  const canGenerateAlbumCover =
    entitlementAllowsCover && variantsSupported && generationReady;

  const [images, setImages] = useState(albumCoverImages);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(
    selectedAlbumCoverUrl ?? defaultImageUrl ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  /** Locks CTA after first click until success or error (blocks double-submit). */
  const [isCoverRequestLocked, setIsCoverRequestLocked] = useState(false);

  useEffect(() => {
    setImages(albumCoverImages);
  }, [albumCoverImages]);

  useEffect(() => {
    setActiveImageUrl(selectedAlbumCoverUrl ?? defaultImageUrl ?? null);
  }, [selectedAlbumCoverUrl, defaultImageUrl]);

  useEffect(() => {
    setIsCoverRequestLocked(false);
    setError(null);
  }, [generationId]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!generationId) {
        throw new Error("Generation id is required");
      }

      if (!variantsSupported) {
        throw new Error("Cover variants are unavailable for this provider");
      }

      if (!isAlbumCoverGenerationReady({ status: generationStatus, hasReadyTracks })) {
        throw new Error(t("waitingForReady"));
      }

      try {
        return await api.music.getAlbumCover(generationId);
      } catch (fetchError) {
        const status =
          typeof fetchError === "object" &&
          fetchError !== null &&
          "status" in fetchError &&
          typeof (fetchError as { status: unknown }).status === "number"
            ? (fetchError as { status: number }).status
            : undefined;

        if (status === 404) {
          // Product cost is 0 — no credit spend; do not invalidate balance as if charged.
          return api.music.fetchAlbumCover(generationId);
        }

        throw fetchError;
      }
    },
    onMutate: () => {
      setIsCoverRequestLocked(true);
      setError(null);
    },
    onSuccess: (result) => {
      setImages(result.images);
      const nextImage = result.selectedImageUrl ?? result.defaultImageUrl;
      setActiveImageUrl(nextImage);
      onCoverUpdated?.(nextImage, result.images);
      void queryClient.invalidateQueries({ queryKey: ["music-history"] });
      setError(null);

      if (result.images.length === 0) {
        setIsCoverRequestLocked(false);
      }
    },
    onError: (mutationError) => {
      setIsCoverRequestLocked(false);
      setError(parseApiError(mutationError, tErrors("coverGenerateFailed")));
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      if (!generationId) {
        throw new Error("Generation id is required");
      }

      return api.music.selectAlbumCover(generationId, imageUrl);
    },
    onSuccess: (result) => {
      setActiveImageUrl(result.selectedImageUrl ?? result.defaultImageUrl);
      setImages(result.images);
      onCoverUpdated?.(result.selectedImageUrl ?? result.defaultImageUrl, result.images);
      void queryClient.invalidateQueries({ queryKey: ["music-history"] });
      setError(null);
    },
    onError: (mutationError) => {
      setError(parseApiError(mutationError, tErrors("coverSelectFailed")));
    },
  });

  const variants = buildVariantOptions(defaultImageUrl, images);
  const hasGeneratedVariants = images.length > 0;
  const isGenerateBusy = generateMutation.isPending || isCoverRequestLocked;
  const isBusy = isGenerateBusy || selectMutation.isPending;
  const showWaitingForReady =
    entitlementAllowsCover &&
    variantsSupported &&
    Boolean(generationId) &&
    !generationReady &&
    !hasGeneratedVariants;

  function handleGenerateCoverClick(): void {
    if (isGenerateBusy || !generationId) {
      return;
    }

    setIsCoverRequestLocked(true);
    generateMutation.mutate();
  }

  return (
    <div className={mtk.coverRow}>
      <TrackCoverImage
        imageUrl={activeImageUrl}
        title={title}
        onExpand={activeImageUrl ? () => setIsLightboxOpen(true) : undefined}
      />
      {isLightboxOpen && activeImageUrl ? (
        <TrackCoverLightbox
          imageUrl={activeImageUrl}
          title={title}
          onClose={() => setIsLightboxOpen(false)}
        />
      ) : null}
      <div className={mtk.coverPanel}>
        {variants.length > 1 ? (
          <div className={mtk.coverVariants}>
            {variants.map((imageUrl) => {
              const isActive = imageUrl === activeImageUrl;
              const className = cn(
                mtk.coverVariantButton,
                isActive ? mtk.coverVariantButtonActive : undefined,
              );

              if (isActive) {
                return (
                  <button
                    key={imageUrl}
                    aria-label={t("selectedAria")}
                    aria-pressed="true"
                    className={className}
                    disabled={isBusy || !generationId}
                    type="button"
                    onClick={() => selectMutation.mutate(imageUrl)}
                  >
                    <img alt="" className={mtk.coverVariantImage} src={imageUrl} />
                  </button>
                );
              }

              return (
                <button
                  key={imageUrl}
                  aria-label={t("selectAria")}
                  aria-pressed="false"
                  className={className}
                  disabled={isBusy || !generationId}
                  type="button"
                  onClick={() => selectMutation.mutate(imageUrl)}
                >
                  <img alt="" className={mtk.coverVariantImage} src={imageUrl} />
                </button>
              );
            })}
          </div>
        ) : null}

        {canGenerateAlbumCover && generationId && !hasGeneratedVariants ? (
          <>
            <button
              aria-busy={isGenerateBusy}
              className={mtk.coverActionButton}
              disabled={isGenerateBusy}
              type="button"
              onClick={handleGenerateCoverClick}
            >
              {isGenerateBusy ? t("generating") : t("newVariants")}
            </button>
            {isGenerateBusy ? (
              <p className={mtk.coverHint}>{t("creatingVariants")}</p>
            ) : null}
          </>
        ) : null}

        {showWaitingForReady ? (
          <p className={mtk.coverHint}>{t("waitingForReady")}</p>
        ) : null}

        {entitlementAllowsCover && !variantsSupported ? (
          <p className={mtk.coverHint}>{t("variantsUnavailable")}</p>
        ) : null}

        {!entitlementAllowsCover ? (
          <p className={mtk.coverHint}>
            {t("needPlan")}{" "}
            <Link className="text-violet-300 underline underline-offset-2" href="/pricing">
              {t("creditPackages")}
            </Link>
          </p>
        ) : null}

        {error ? <p className={mtk.error}>{error}</p> : null}
      </div>
    </div>
  );
}
