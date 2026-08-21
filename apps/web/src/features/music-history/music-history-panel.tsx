"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { mtk } from "@/shared/theme/music-track-classes";
import { DeleteIconButton } from "@/shared/ui/delete-icon-button";
import { HistoryItemGroupCard } from "@/features/music-history/components/history-item-group";
import { groupHistoryItems } from "@/features/music-history/utils/history-item-grouping";
import type { MusicHistoryPanelProps } from "@/features/music-history/music-history-panel.types";
import { cn } from "@/lib/utils";

export function MusicHistoryPanel({
  items,
  isLoading,
  isDeleting,
  onDelete,
  onDeleteTrack,
  onOpenEditor,
  openingEditorTrackId,
}: MusicHistoryPanelProps) {
  const t = useTranslations("History");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const groupedItems = useMemo(() => groupHistoryItems(items), [items]);
  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const hasSelection = selectedIds.length > 0;

  function toggleItem(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : items.map((item) => item.id));
  }

  async function handleDeleteSelected() {
    if (!hasSelection) {
      return;
    }

    await onDelete(selectedIds);
    setSelectedIds([]);
  }

  async function handleDeleteOne(id: string) {
    await onDelete([id]);
    setSelectedIds((current) => current.filter((itemId) => itemId !== id));
  }

  if (isLoading) {
    return <p className={mtk.meta}>{t("loading")}</p>;
  }

  if (items.length === 0) {
    return (
      <div className={mtk.meta}>
        <p className="font-medium text-[var(--app-text)]">{t("empty.title")}</p>
        <p className="mt-1">{t("empty.description")}</p>
        <p className="mt-3">
          <Link className="underline underline-offset-2" href="/music-create">
            {t("empty.action")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className={mtk.historyList}>
      <div className={cn(mtk.historyToolbar, "grid-cols-[1fr_auto]")}>
        <label className={cn(mtk.historyCheckboxLabel, "min-w-0 gap-2")}>
          <input
            checked={allSelected}
            className={mtk.historyCheckbox}
            type="checkbox"
            onChange={toggleAll}
          />
          <span className={mtk.historyToolbarTitle}>
            {hasSelection ? t("selectedCount", { count: selectedIds.length }) : t("selectAll")}
          </span>
        </label>
        <DeleteIconButton
          disabled={!hasSelection || isDeleting}
          label={t("deleteSelected")}
          onClick={() => void handleDeleteSelected()}
        />
      </div>

      {groupedItems.map((group) => (
        <HistoryItemGroupCard
          key={group.id}
          group={group}
          isDeleting={isDeleting}
          openingEditorTrackId={openingEditorTrackId}
          selectedSet={selectedSet}
          onDelete={(id) => void handleDeleteOne(id)}
          onDeleteTrack={onDeleteTrack}
          onOpenEditor={onOpenEditor}
          onToggleSelect={toggleItem}
        />
      ))}
    </div>
  );
}
