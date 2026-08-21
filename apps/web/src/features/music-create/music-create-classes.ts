import { appShell } from "@/shared/theme/app-theme";

/** Shared Tailwind classes for Music Create form UI. */
export const mc = {
  cardHeader: "mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
  cardHeaderTitle: "text-base font-semibold",
  cardHeaderSubtitle: `mt-0.5 text-xs ${appShell.textMuted}`,
  historyCardHeader: "mb-5 flex items-center gap-2",
  modeToggle: appShell.modeToggle,
  modeToggleActive: appShell.modeToggleActive,
  fieldStack: "flex flex-col gap-4",
  fieldLabel:
    `mb-1.5 block text-xs font-medium uppercase tracking-wider ${appShell.textMuted}`,
  input: appShell.fieldInput,
  textarea: appShell.fieldTextarea,
  textareaLarge: appShell.fieldTextareaLarge,
  textareaStyle: "h-16 w-full resize-none",
  styleReadonly: "cursor-not-allowed opacity-70",
  planNotice: "text-xs leading-snug text-amber-700 dark:text-amber-300",
  planNoticeLink: "font-medium text-violet-500 underline-offset-2 hover:underline",
  generationCostHint: `text-xs leading-snug ${appShell.textMuted}`,
  personalVoiceToggleGroup: "flex flex-col gap-1.5",
  personalVoiceToggle:
    "flex cursor-pointer items-start gap-3 rounded-lg border border-violet-500/25 bg-violet-600/5 p-3",
  personalVoiceCheckbox: "mt-0.5 h-4 w-4 shrink-0 accent-violet-600",
  personalVoiceToggleText: "flex min-w-0 flex-col gap-0.5",
  personalVoiceToggleTitle: "text-sm font-semibold text-[var(--app-text)]",
  personalVoiceToggleHint: `text-xs ${appShell.textMuted}`,
  textareaPrompt: "h-28 w-full resize-none",
  select: appShell.fieldSelect,
  durationWrap: "relative",
  durationIcon:
    `pointer-events-none absolute inset-y-0 left-3 flex items-center ${appShell.textMuted}`,
  durationChevron:
    `pointer-events-none absolute inset-y-0 right-3 flex items-center ${appShell.textMuted}`,
  meta: `mt-1.5 text-xs ${appShell.textMuted}`,
  submit: `${appShell.btnPrimary} w-full`,
  submitSpinner:
    "h-4 w-4 animate-spin rounded-full border-2 border-[var(--app-border-default)] border-t-[var(--app-text)]",
  loaderWrap: appShell.loaderWrap,
  tracksList: "mt-4 flex flex-col gap-3",
  trackPlaceholder:
    "flex items-center gap-3 rounded-xl border border-dashed border-[var(--app-border-default)] bg-[var(--app-hover-overlay)] px-4 py-5",
  trackPlaceholderText: `text-sm ${appShell.textMuted}`,
  trackVariantFailed: `rounded-xl border border-[var(--app-border-subtle)] px-4 py-3 text-sm ${appShell.textMuted}`,
  taskMeta: "mt-3 font-mono text-xs text-neutral-600",
  charCounter: appShell.charCounter,
  charCounterLimit: appShell.charCounterLimit,
  counterPos: "absolute bottom-2 right-3",
  counterPosLarge: "absolute bottom-3 right-3",
  chip: appShell.chip,
  chipSelected: appShell.chipSelected,
  chipDisabled: appShell.chipDisabled,
  chipInput: "sr-only",
  chipRow: "flex flex-wrap gap-1.5",
  styleHint: `text-xs leading-snug ${appShell.textMuted}`,
  comboPanelItem:
    "w-full cursor-pointer rounded-md border-none bg-transparent px-2.5 py-1.5 text-left text-sm text-neutral-900 hover:bg-[#a8c8ef] focus-visible:bg-[#a8c8ef] focus-visible:outline-none",
  comboPanelItemActive:
    "w-full cursor-pointer rounded-md bg-[#a8c8ef] px-2.5 py-1.5 text-left text-sm text-neutral-900",
  lyricsBlock: "mt-2 border-t border-[var(--app-border-subtle)] pt-4",
  lyricsOrDivider:
    "py-1 text-center text-xs font-medium uppercase tracking-widest text-[var(--app-text-subtle)]",
  fieldDisabled: "cursor-not-allowed opacity-50",
  lyricsPromptLabel:
    `mb-1.5 block text-xs font-medium uppercase tracking-wider ${appShell.textMuted}`,
  secondaryButton: appShell.btnSecondary,
  lyricsVariants: "flex flex-col gap-2",
  lyricsVariantList: "flex flex-wrap gap-2",
  lyricsVariant:
    "rounded-full border border-[var(--app-border-default)] bg-[var(--app-hover-overlay)] px-3 py-1.5 text-xs text-[var(--app-text)]",
  lyricsVariantActive:
    "rounded-full border border-violet-500 bg-violet-600/15 px-3 py-1.5 text-xs text-violet-500 dark:text-violet-400",
  errorInline: "text-sm text-rose-400",
  wizardStepHeader: "flex flex-col gap-1.5",
  wizardStepBadge:
    "w-fit rounded-full bg-violet-600/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-400",
  wizardStepTitle: "text-base font-semibold text-[var(--app-text)] sm:text-lg",
  wizardStepHint: `text-sm ${appShell.textMuted}`,
  wizardActions: "grid gap-2 sm:grid-cols-[auto_1fr]",
  voicePickerSection: "flex flex-col gap-2",
  voicePickerToggle:
    "flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--app-border-default)] bg-[var(--app-hover-overlay)] px-4 py-3 text-left transition-colors hover:bg-[var(--app-surface-elevated)]",
  voicePickerToggleActive: "border-violet-500/40 bg-violet-600/10",
  voicePickerToggleMain: "flex min-w-0 flex-1 items-center gap-3",
  voicePickerToggleText: "flex min-w-0 flex-col",
  voicePickerToggleIcon: "h-4 w-4 shrink-0 text-violet-400",
  voicePickerToggleTitle: "text-sm font-medium text-[var(--app-text)]",
  voicePickerToggleMeta: `mt-0.5 text-xs ${appShell.textMuted}`,
  voicePickerPanel:
    "flex flex-col gap-2 rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-elevated)] p-2",
  voicePickerItem:
    "flex flex-col gap-3 rounded-lg border border-transparent px-3 py-3 transition-colors",
  voicePickerItemSelected: "border-violet-500/40 bg-violet-600/10",
  voicePickerItemDisabled: "opacity-70",
  voicePickerItemHeader: "flex items-start gap-3",
  voicePickerItemRadio: "mt-1 h-4 w-4 shrink-0 accent-violet-500",
  voicePickerItemBody: "min-w-0 flex-1",
  voicePickerItemTitle: "text-sm font-medium text-[var(--app-text)]",
  voicePickerItemMeta: `mt-1 flex flex-wrap items-center gap-2 text-xs ${appShell.textMuted}`,
  voicePickerBadgeReady:
    "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400",
  voicePickerBadgePending:
    "rounded-full bg-[var(--app-hover-overlay)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-text-muted)]",
  voicePickerBadgeWarning:
    "rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300",
  voicePickerBadgeError:
    "rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300",
  voicePickerPlayer: "min-w-0 flex-1",
  voicePickerPlayerRow: "flex items-center gap-2",
  voicePickerDeleteButton: `${appShell.btnSecondaryOutline} shrink-0 px-3 py-2 text-xs`,
  voicePickerEmpty: `rounded-xl border border-dashed border-[var(--app-border-default)] px-4 py-6 text-center text-sm ${appShell.textMuted}`,
  voicePickerLink: "text-violet-400 underline-offset-2 hover:underline",
} as const;
