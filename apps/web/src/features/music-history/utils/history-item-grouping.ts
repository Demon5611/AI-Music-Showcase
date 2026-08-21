import type { MusicGenerationRecordDto } from "@ai-music/shared";
import { formatTrackTitleValue } from "@/entities/track";

const REMIX_TITLE_PATTERN = /^(.+) — .+ remix$/i;

export function resolveHistoryItemTitle(item: MusicGenerationRecordDto): string {
  return (
    formatTrackTitleValue(item.title ?? "") ||
    item.prompt.slice(0, 60) ||
    "Untitled track"
  );
}

export function isRemixHistoryItem(item: MusicGenerationRecordDto): boolean {
  const title = item.title?.trim() ?? "";
  return REMIX_TITLE_PATTERN.test(title);
}

export function getRemixParentTitle(item: MusicGenerationRecordDto): string | null {
  const title = item.title?.trim() ?? "";
  const match = title.match(REMIX_TITLE_PATTERN);
  return match?.[1]?.trim() ?? null;
}

export interface HistoryItemGroup {
  id: string;
  root: MusicGenerationRecordDto;
  remixes: MusicGenerationRecordDto[];
}

function sortByCreatedAtDesc(
  left: MusicGenerationRecordDto,
  right: MusicGenerationRecordDto,
): number {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function resolveGroupLatestTimestamp(group: HistoryItemGroup): number {
  const timestamps = [
    new Date(group.root.createdAt).getTime(),
    ...group.remixes.map((item) => new Date(item.createdAt).getTime()),
  ];

  return Math.max(...timestamps);
}

export function groupHistoryItems(items: MusicGenerationRecordDto[]): HistoryItemGroup[] {
  const remixesByParentTitle = new Map<string, MusicGenerationRecordDto[]>();
  const roots: MusicGenerationRecordDto[] = [];

  for (const item of items) {
    if (isRemixHistoryItem(item)) {
      const parentTitle = getRemixParentTitle(item);

      if (parentTitle) {
        const list = remixesByParentTitle.get(parentTitle) ?? [];
        list.push(item);
        remixesByParentTitle.set(parentTitle, list);
      }

      continue;
    }

    roots.push(item);
  }

  const rootTitles = new Set(roots.map(resolveHistoryItemTitle));
  const groups: HistoryItemGroup[] = roots.map((root) => ({
    id: root.id,
    root,
    remixes: (remixesByParentTitle.get(resolveHistoryItemTitle(root)) ?? []).sort(
      sortByCreatedAtDesc,
    ),
  }));

  for (const [parentTitle, remixes] of remixesByParentTitle) {
    if (rootTitles.has(parentTitle)) {
      continue;
    }

    for (const remix of remixes.sort(sortByCreatedAtDesc)) {
      groups.push({ id: remix.id, root: remix, remixes: [] });
    }
  }

  return groups.sort(
    (left, right) => resolveGroupLatestTimestamp(right) - resolveGroupLatestTimestamp(left),
  );
}
