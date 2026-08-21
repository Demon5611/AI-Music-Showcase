import type { MusicGenerationRecordDto } from "@ai-music/shared";

export interface MusicHistoryPanelProps {
  items: MusicGenerationRecordDto[];
  isLoading: boolean;
  isDeleting: boolean;
  onDelete: (ids: string[]) => Promise<void>;
  onDeleteTrack: (trackId: string) => Promise<void>;
  onOpenEditor?: (trackId: string) => void;
  openingEditorTrackId?: string | null;
}
