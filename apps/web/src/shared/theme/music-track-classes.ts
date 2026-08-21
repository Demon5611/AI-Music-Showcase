import { appShell } from "@/shared/theme/app-theme";

/** Shared Tailwind classes for music track cards, lyrics, and history lists. */
export const mtk = {
  lyrics: `overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed ${appShell.textMuted}`,
  lyricsBlockInner: "flex flex-col gap-1.5",
  lyricsHeader: "flex items-center justify-between gap-3",
  lyricsLabel: `text-xs ${appShell.textMuted}`,
  toggleLyricsButton:
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--app-border-default)] bg-[var(--app-hover-overlay)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]",
  toggleLyricsIcon: "h-4 w-4",
  resultPlayer: `${appShell.surfaceCard} p-4`,
  resultHeader: "mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3",
  resultActions: "flex shrink-0 flex-wrap items-center gap-1.5",
  resultDownloadButton: `${appShell.btnSecondaryOutline} px-3 py-1.5 text-xs`,
  resultMeta: "flex flex-wrap items-baseline gap-2",
  resultTitle: "text-sm font-semibold text-[var(--app-text)]",
  resultDuration: `text-xs ${appShell.textMuted}`,
  editorLink:
    "mt-3 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60",
  player: "w-full min-w-0",
  audioUnavailable: `text-sm ${appShell.textMuted}`,
  meta: `mt-1.5 text-xs ${appShell.textMuted}`,
  error: "text-sm text-rose-400",
  historyList: "flex flex-col gap-3",
  historyToolbar:
    "flex flex-col gap-2 pb-1 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-3",
  historyToolbarTitle: `text-xs ${appShell.textMuted}`,
  historyCheckboxLabel: "inline-flex items-center",
  historyCheckbox: appShell.accentCheckbox,
  historyItem: `flex flex-col gap-2 ${appShell.surfaceCard} p-3`,
  historyFamilyGroup:
    "flex flex-col gap-3 rounded-xl border-2 border-white/55 bg-[var(--app-surface)] p-3 shadow-[0_0_24px_rgba(255,255,255,0.06)] sm:p-4",
  historyFamilyGroupWithRemixes: "border-white/70",
  historyRootSection: "flex flex-col gap-2",
  historyRemixList: "flex flex-col gap-3 border-t border-white/25 pt-3",
  historyRemixSection:
    "flex flex-col gap-2 rounded-lg border border-white/35 bg-black/15 p-3",
  historyRemixBadge:
    "shrink-0 rounded-full border border-white/40 bg-white/10 px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--app-text)]",
  historyTitleGroup: "flex min-w-0 flex-1 flex-wrap items-center gap-2",
  historyHeader: "flex items-start gap-3",
  historyHeaderMain: "flex min-w-0 flex-1 flex-col gap-1.5",
  historyTitleRow: "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3",
  historyTitle: "flex-1 text-sm font-semibold text-[var(--app-text)]",
  historyTitleMeta: "flex flex-wrap items-center gap-2",
  historyBadge:
    "shrink-0 rounded-full bg-[var(--app-hover-overlay)] px-2 py-0.5 text-xs text-[var(--app-text)]",
  historyMeta: `text-xs ${appShell.textMuted}`,
  historyTrack: "flex min-w-0 flex-col gap-1.5 border-t border-[var(--app-border-subtle)] pt-2",
  historyTrackUnit:
    "flex min-w-0 flex-col gap-2 rounded-lg border border-white/40 bg-[var(--app-hover-overlay)]/25 p-3",
  historyTrackUnitRoot: "border-white/50",
  historyTrackUnitRemix: "border-white/30 bg-black/10",
  historyTrackHeader: "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3",
  historyTrackMeta: "flex flex-wrap items-baseline gap-2",
  historyTrackTitle: "text-xs text-[var(--app-text)]",
  coverRow: "flex min-w-0 gap-3",
  coverImage: "h-20 w-20 shrink-0 rounded-lg border border-[var(--app-border-subtle)] object-cover",
  coverImageInner: "h-full w-full object-cover",
  coverPlaceholder:
    "flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-[var(--app-border-default)] bg-[linear-gradient(145deg,var(--app-hover-overlay),transparent)] text-[var(--app-text-muted)]",
  coverPlaceholderInitials:
    "text-sm font-semibold uppercase tracking-wide text-[var(--app-text)]",
  coverPanel: "flex min-w-0 flex-1 flex-col gap-2",
  coverVariants: "flex flex-wrap gap-2",
  coverVariantButton:
    "overflow-hidden rounded-md border border-[var(--app-border-default)] p-0 transition-colors hover:border-violet-500/50",
  coverVariantButtonActive: "border-violet-500 ring-1 ring-violet-500/40",
  coverVariantImage: "h-12 w-12 object-cover",
  coverActionButton: `${appShell.btnSecondaryOutline} px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50`,
  coverHint: `text-xs ${appShell.textMuted}`,
  coverImageButton:
    "h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[var(--app-border-subtle)] p-0 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50",
  coverLightboxBackdrop:
    "fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4",
  coverLightboxToolbar: "absolute right-4 top-4 flex items-center gap-2",
  coverLightboxImage: "max-h-[85vh] max-w-full object-contain",
  coverLightboxClose:
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white transition-colors hover:bg-black/60",
  coverLightboxDownload: `${appShell.btnSecondaryOutline} border-white/20 bg-black/40 px-4 py-2 text-sm text-white hover:bg-black/60`,
} as const;
