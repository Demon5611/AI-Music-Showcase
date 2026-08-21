"use client";

import type { MusicGenerationRecordDto } from "@ai-music/shared";
import { mtk } from "@/shared/theme/music-track-classes";
import { HistoryRecordSection } from "@/features/music-history/components/history-record-section";
import {
  isRemixHistoryItem,
  type HistoryItemGroup,
} from "@/features/music-history/utils/history-item-grouping";
import { cn } from "@/lib/utils";

interface HistoryItemGroupCardProps {
  group: HistoryItemGroup;
  isDeleting: boolean;
  selectedSet: Set<string>;
  openingEditorTrackId?: string | null;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onOpenEditor?: (trackId: string) => void;
}

export function HistoryItemGroupCard({
  group,
  isDeleting,
  selectedSet,
  openingEditorTrackId,
  onToggleSelect,
  onDelete,
  onDeleteTrack,
  onOpenEditor,
}: HistoryItemGroupCardProps) {
  const hasRemixes = group.remixes.length > 0;
  const isStandaloneRemix = group.remixes.length === 0 && isRemixHistoryItem(group.root);

  return (
    <article
      className={cn(
        mtk.historyFamilyGroup,
        hasRemixes && mtk.historyFamilyGroupWithRemixes,
      )}
    >
      <HistoryRecordSection
        isDeleting={isDeleting}
        isSelected={selectedSet.has(group.root.id)}
        item={group.root}
        openingEditorTrackId={openingEditorTrackId}
        titleId={`history-item-title-${group.root.id}`}
        variant={isStandaloneRemix ? "remix" : "root"}
        onDelete={onDelete}
        onDeleteTrack={onDeleteTrack}
        onOpenEditor={onOpenEditor}
        onToggleSelect={onToggleSelect}
      />

      {hasRemixes ? (
        <div className={mtk.historyRemixList}>
          {group.remixes.map((remix) => (
            <HistoryRecordSection
              key={remix.id}
              isDeleting={isDeleting}
              isSelected={selectedSet.has(remix.id)}
              item={remix}
              openingEditorTrackId={openingEditorTrackId}
              titleId={`history-item-title-${remix.id}`}
              variant="remix"
              onDelete={onDelete}
              onDeleteTrack={onDeleteTrack}
              onOpenEditor={onOpenEditor}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
