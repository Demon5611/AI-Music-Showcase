import { appShell } from "@/shared/theme/app-theme";

const btnBase =
  "rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55";

/** Music editor UI — Tailwind only, theme via CSS variables in globals.css. */
export const me = {
  section:
    "flex flex-1 flex-col gap-4 bg-[var(--app-bg-page)] px-4 pb-6 pt-4 text-[var(--app-text)] sm:gap-5 sm:px-6 sm:pb-8 sm:pt-6 md:px-[50px]",
  sectionHintsHidden: "[&_.panel-hint]:hidden",
  title: "text-2xl font-bold tracking-tight text-[var(--app-text)] sm:text-[1.75rem]",
  editorHeader: "flex flex-wrap items-center justify-between gap-4",
  hintsToggle: "group inline-flex cursor-pointer select-none items-center gap-2.5",
  hintsToggleLabel: "text-sm font-medium text-[var(--app-text-muted)]",
  hintsToggleInput: "peer sr-only",
  hintsToggleTrack:
    "relative h-[1.375rem] w-10 rounded-full bg-[var(--app-border-default)] transition-colors group-has-[:checked]:bg-violet-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet-500/50",
  hintsToggleThumb:
    "absolute left-0.5 top-0.5 h-[1.125rem] w-[1.125rem] rounded-full bg-white shadow-sm transition-transform group-has-[:checked]:translate-x-[1.125rem]",
  layout:
    "grid items-start gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]",
  mainColumn: "flex min-w-0 flex-col gap-4",
  sideColumn: "flex min-w-0 flex-col gap-4",
  panel: `${appShell.surfaceCard} p-3 sm:p-4`,
  panelTitle: "mb-3 text-[0.95rem] font-semibold text-[var(--app-text)]",
  panelHint: "panel-hint text-sm text-[var(--app-text-muted)]",
  tracksMuteUnavailableHint:
    "mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.8125rem] leading-relaxed text-amber-900 dark:text-amber-200",
  statusCard:
    "rounded-xl border border-dashed border-[var(--app-border-default)] bg-[var(--app-bg-elevated)] p-4",
  preparationStatus: "flex flex-col gap-3",
  preparationStatusCompact: "mb-3 flex flex-col gap-3",
  preparationHeader: "flex items-start gap-3",
  preparationSpinner:
    "mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600",
  preparationTitle: "text-sm font-semibold text-[var(--app-text)]",
  preparationMeta: "mt-1 text-[0.8125rem] text-[var(--app-text-muted)]",
  preparationProgressRow: "flex items-center gap-3",
  preparationProgress:
    "h-1 flex-1 appearance-none overflow-hidden rounded-full border-none bg-[var(--app-border-subtle)] [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-violet-600 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[var(--app-border-subtle)] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-violet-600 [&::-webkit-progress-value]:transition-[width]",
  preparationProgressValue:
    "shrink-0 text-[0.8125rem] tabular-nums text-[var(--app-text-muted)]",
  stemNoticeCard:
    "rounded-xl border border-amber-500/35 bg-amber-500/10 p-4",
  stemNoticeTitle: "text-sm font-semibold text-amber-200",
  stemNoticeMessage: "mt-2 text-sm leading-relaxed text-[var(--app-text)]",
  stemNoticeHint: "mt-2 text-[0.8125rem] leading-relaxed text-[var(--app-text-muted)]",
  stemNoticeActions: "mt-3 flex flex-wrap gap-2",
  stemNoticeLink: "font-medium text-violet-300 underline underline-offset-2 hover:text-violet-200",
  timelineBlock: `${appShell.surfaceCard} w-full p-3 sm:p-4`,
  timelineHeader:
    "mb-3 flex flex-wrap items-center justify-between gap-3",
  timelineTitleRow: "flex items-center gap-2",
  blockLabel: "text-sm font-semibold text-[var(--app-text)]",
  timelineModeButton: `${btnBase} border-[var(--app-border-default)] bg-[var(--app-bg-surface)] text-[var(--app-text)] hover:border-[var(--app-border-strong)]`,
  timelineModeButtonActive: `${btnBase} border-violet-500 bg-violet-600/15 text-violet-400`,
  transportBar: "flex flex-wrap items-center gap-2",
  transportButton: `${btnBase} border-[var(--app-border-default)] bg-[var(--app-bg-surface)] text-[var(--app-text)] hover:border-[var(--app-border-strong)]`,
  transportButtonActive: `${btnBase} border-violet-500 bg-violet-600/15 text-violet-400`,
  transportTime:
    "min-w-[7rem] text-[0.8125rem] tabular-nums text-[var(--app-text)]",
  transportZoom: "flex gap-1.5",
  playlistShell:
    "w-full overflow-x-auto overflow-y-hidden rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-bg-elevated)]",
  playlistTrackLabel:
    "box-border flex h-full min-h-0 w-full items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap p-1 px-1.5 text-center text-[0.8125rem] font-semibold leading-tight text-[var(--editor-stem-label-text)]",
  playlistTrackLabelVocal: "bg-[var(--editor-stem-vocal-bg)]",
  playlistTrackLabelInstrumental: "bg-[var(--editor-stem-instrumental-bg)]",
  playlistShellHint: "m-0 p-4 text-sm text-[var(--app-text-muted)]",
  timelineHint: "mt-2 text-[0.8125rem] text-[var(--app-text-muted)]",
  contextPanel:
    "rounded-xl border border-violet-500/30 bg-violet-600/10 px-4 py-3.5",
  contextTitle: "mb-1.5 text-sm font-semibold text-[var(--app-text)]",
  contextGrid:
    "flex flex-wrap gap-x-5 gap-y-3 text-sm text-violet-900 dark:text-violet-200",
  trackList: "flex flex-col gap-3",
  trackLaneRow:
    "grid cursor-pointer grid-cols-1 items-center gap-2 rounded-[0.625rem] border border-[var(--app-border-subtle)] bg-[var(--app-bg-elevated)] p-2.5 sm:grid-cols-[minmax(120px,160px)_auto_minmax(0,1fr)] sm:gap-3",
  trackLaneRowSelected:
    "grid cursor-pointer grid-cols-1 items-center gap-2 rounded-[0.625rem] border border-violet-500 bg-violet-600/10 p-2.5 sm:grid-cols-[minmax(120px,160px)_auto_minmax(0,1fr)] sm:gap-3",
  trackLaneLabel: "font-semibold text-[var(--app-text)]",
  trackLaneControls: "flex items-center gap-1.5",
  laneToggle:
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--app-border-default)] bg-[var(--app-bg-surface)] p-0 text-xs font-semibold leading-none text-[var(--app-text)] transition-colors disabled:cursor-not-allowed disabled:opacity-55",
  laneToggleActive:
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-500 bg-violet-600/20 p-0 text-xs font-semibold leading-none text-violet-400 transition-colors disabled:cursor-not-allowed disabled:opacity-55",
  trackVolumeLabel:
    "flex min-w-[6.5rem] items-center gap-1.5 text-xs text-[var(--app-text-muted)]",
  trackVolumeSlider: "w-[5.5rem] accent-violet-600",
  trackWaveformWrap: "min-w-0",
  trackProgressBar:
    "track-progress-bar relative h-12 w-full cursor-pointer overflow-hidden rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-elevated)] p-0",
  trackProgressFill: "track-progress-fill pointer-events-none block h-full",
  toolbarSection: "mb-3.5",
  toolbarSectionTitle:
    "mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]",
  toolbarGrid: "flex flex-wrap gap-2",
  toolbarRow: "flex flex-wrap gap-2",
  toolButton: `${btnBase} border-[var(--app-border-default)] bg-[var(--app-bg-surface)] text-[var(--app-text)] hover:bg-[var(--app-hover-overlay)]`,
  toolButtonDestructive: `${btnBase} border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20`,
  primaryButton: `${btnBase} border-violet-600 bg-violet-600 text-white hover:bg-violet-500 hover:border-violet-500`,
  secondaryButton: `${btnBase} inline-flex items-center justify-center border-[var(--app-border-default)] bg-[var(--app-bg-surface)] text-[var(--app-text)] hover:border-[var(--app-border-strong)]`,
  historyList: "m-0 mb-3 flex list-none flex-col gap-1.5 p-0",
  historyItem:
    "border-b border-[var(--app-border-subtle)] pb-1.5 text-sm text-[var(--app-text)]",
  historyButton:
    "w-full cursor-pointer border-none bg-transparent p-0 text-left text-inherit hover:text-violet-400",
  helpPanel:
    "rounded-xl border border-dashed border-[var(--app-border-default)] bg-[var(--app-bg-elevated)] px-4 py-3",
  helpToggle:
    "cursor-pointer border-none bg-transparent p-0 text-sm font-semibold text-[var(--app-text)]",
  helpList:
    "mt-3 mb-0 list-decimal pl-5 text-sm text-[var(--app-text-muted)] [&>li]:mb-1.5",
  error: "text-sm text-rose-400",
  player: "mt-3 w-full",
  renderResult: "mt-3 flex flex-col gap-2",
  renderStatus: "m-0 mt-3 text-sm leading-relaxed text-[var(--app-text-muted)]",
  textInput: appShell.fieldInput,
  selectInput: appShell.fieldSelect,
  fieldLabel:
    "mb-3 flex flex-col gap-1.5 text-sm text-[var(--app-text)]",
  dialogBackdrop:
    "fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4",
  dialogCard: `${appShell.surfaceCard} w-full max-w-[420px] p-4`,
  dialogCardWide: `${appShell.surfaceCard} max-h-[min(90vh,720px)] w-full max-w-[520px] overflow-auto p-4`,
  dialogHint: "mb-3 text-[0.8125rem] leading-snug text-[var(--app-text-muted)]",
  voiceModelListSection: "mb-3 flex flex-col gap-1.5",
  voiceModelListTitle: "m-0 text-[0.8125rem] text-[var(--app-text-muted)]",
  voiceModelList: "flex max-h-56 flex-col gap-1.5 overflow-auto pr-0.5",
  voiceModelOption: `${btnBase} h-auto w-full flex-col items-start gap-0.5 border-[var(--app-border-subtle)] bg-[var(--app-bg-surface)] px-2.5 py-2 text-left`,
  voiceModelOptionSelected: `${btnBase} h-auto w-full flex-col items-start gap-0.5 border-violet-500 bg-violet-600/15 px-2.5 py-2 text-left`,
  voiceModelOptionTitle: "text-sm font-medium text-[var(--app-text)]",
  voiceModelOptionMeta: "text-xs text-[var(--app-text-muted)]",
  voiceModelOptionTags: "text-xs text-[var(--app-text-muted)]",
  voiceModelPagination: "mb-3 flex items-center justify-between gap-2",
  voiceModelPaginationLabel: "text-center text-[0.8125rem] text-[var(--app-text-muted)]",
  dialogActions: "mt-3 flex justify-end gap-2",
  voicePresetsSection: "flex w-full flex-col gap-4",
  voicePresetPanel: `${appShell.surfaceCard} flex flex-col gap-2 p-4 sm:p-5`,
  voicePresetLabel: "text-base font-semibold text-[var(--app-text)]",
  voicePresetChips: "flex flex-wrap gap-1.5",
  voicePresetChip: `${btnBase} border-[var(--app-border-default)] bg-[var(--app-bg-surface)] px-2.5 py-1 text-xs text-[var(--app-text)] hover:border-[var(--app-border-strong)]`,
  voicePresetChipActive:
    "border-violet-500/70 bg-violet-500/10 text-[var(--app-text)]",
  presetDemoCard: `${appShell.surfaceCard} flex flex-col p-4 sm:p-5`,
  presetDemoTitle: "mb-2 text-base font-semibold text-[var(--app-text)]",
  presetDemoHint: "mb-4 text-sm leading-relaxed text-[var(--app-text-muted)]",
  presetDemoChips: "mb-4 flex flex-wrap gap-2",
  remixPanel: `${appShell.surfaceCard} flex flex-col gap-3 p-4 sm:p-5`,
  remixTitle: "text-base font-semibold text-[var(--app-text)]",
  remixDescription: "text-sm leading-relaxed text-[var(--app-text-muted)]",
  remixUnavailable: "text-sm text-amber-200",
  remixControls: "flex flex-col gap-3",
  remixStyles: "flex flex-wrap gap-1.5",
  remixStyleChip: `${btnBase} border-[var(--app-border-default)] bg-[var(--app-bg-surface)] px-2.5 py-1 text-xs text-[var(--app-text)] hover:border-[var(--app-border-strong)]`,
  remixStyleChipActive: "border-violet-500/70 bg-violet-500/10 text-[var(--app-text)]",
  remixLoaderWrap: appShell.loaderWrap,
  remixSuccess: "flex flex-col gap-2 border-t border-[var(--app-border-subtle)] pt-3",
  remixSuccessTitle: "text-sm font-medium text-[var(--app-text)]",
  remixSuccessActions: "flex flex-wrap gap-2",
} as const;
