"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { mtk } from "@/shared/theme/music-track-classes";
import { cn } from "@/lib/utils";
import { coverInitialsFromTitle } from "@/shared/ui/track-cover/cover-initials";

interface TrackCoverImageProps {
  imageUrl?: string | null;
  title: string;
  className?: string;
  onExpand?: () => void;
}

export function TrackCoverImage({
  imageUrl,
  title,
  className,
  onExpand,
}: TrackCoverImageProps) {
  const t = useTranslations("Media");
  const [imageFailed, setImageFailed] = useState(false);
  const trimmedUrl = imageUrl?.trim() || null;

  useEffect(() => {
    setImageFailed(false);
  }, [trimmedUrl]);

  if (!trimmedUrl || imageFailed) {
    return (
      <div
        aria-label={t("coverAlt", { title })}
        className={cn(mtk.coverPlaceholder, className)}
        role="img"
      >
        <span className={mtk.coverPlaceholderInitials}>{coverInitialsFromTitle(title)}</span>
      </div>
    );
  }

  if (onExpand) {
    return (
      <button
        aria-label={t("openCover", { title })}
        className={cn(mtk.coverImageButton, className)}
        type="button"
        onClick={onExpand}
      >
        <img
          alt={t("coverAlt", { title })}
          className={mtk.coverImageInner}
          src={trimmedUrl}
          onError={() => setImageFailed(true)}
        />
      </button>
    );
  }

  return (
    <img
      alt={t("coverAlt", { title })}
      className={cn(mtk.coverImage, className)}
      src={trimmedUrl}
      onError={() => setImageFailed(true)}
    />
  );
}
