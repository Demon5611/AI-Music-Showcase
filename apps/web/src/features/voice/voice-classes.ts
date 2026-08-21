import { appShell } from "@/shared/theme/app-theme";

const btnBase =
  "rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55";

/** Tailwind class maps for voice feature UI. */
export const voiceUi = {
  consentCheckbox: [
    "mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded",
    "border border-[var(--app-border-strong)] bg-[var(--app-field-bg)]",
    "accent-violet-600",
  ].join(" "),
  consentContent: "flex min-w-0 flex-col gap-1",
  consentTitle: "text-sm font-medium leading-snug text-[var(--app-text)]",
  consentPhrase: "text-base sm:text-xl leading-snug text-[var(--app-text-muted)]",
  phraseCountdown:
    "mt-1 inline-flex items-center gap-1.5 text-sm font-medium leading-snug text-amber-900 dark:text-amber-200",
  phraseCountdownExpired:
    "mt-1 inline-flex items-center gap-1.5 text-sm font-medium leading-snug text-rose-600 dark:text-rose-400",
  phraseCountdownTimer: "tabular-nums font-semibold",
  recordingTips:
    "rounded-lg border border-violet-500/20 bg-violet-600/5 p-3",
  recordingTipsTitle: "m-0 mb-2 text-sm font-medium text-[var(--app-text)]",
  recordingTipsList:
    "m-0 flex list-disc flex-col gap-1.5 pl-4 text-xs leading-relaxed text-[var(--app-text-muted)]",
  recordingTipsLink:
    "mt-2 inline-block text-xs text-violet-500 underline-offset-2 hover:underline dark:text-violet-400",
  formActions: "flex flex-col gap-2 sm:flex-row sm:flex-wrap",
  recordScriptWrap: "relative flex flex-col gap-2",
  scriptPopoverTrigger: [
    "inline-flex items-center gap-2 rounded-lg border border-[var(--app-border-default)]",
    "bg-[var(--app-bg-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)]",
    "transition-colors hover:border-violet-500/40 hover:bg-violet-600/5",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" "),
  scriptPopoverTriggerActive: "border-violet-500/40 bg-violet-600/10",
  scriptPopoverIcon: "h-4 w-4 shrink-0",
  scriptPopoverPanel: [
    "rounded-lg border border-violet-500/20 bg-[var(--app-bg-surface)] p-3",
    "shadow-lg shadow-black/10",
  ].join(" "),
  scriptPopoverHint: "m-0 mb-2 text-xs text-[var(--app-text-muted)]",
  scriptPopoverText: "m-0 text-sm leading-relaxed text-[var(--app-text)]",
  languageSelect: "flex flex-col gap-1.5",
  languageLabel: "text-sm font-medium text-[var(--app-text-muted)]",
  languageSelectControl: [
    "w-full max-w-xs rounded-lg border border-[var(--app-border-default)]",
    "bg-[var(--app-field-bg)] px-3 py-2 text-sm text-[var(--app-text)]",
    "disabled:cursor-not-allowed disabled:opacity-55",
  ].join(" "),
  languageHelper: "m-0 text-xs leading-snug text-[var(--app-text-muted)]",
  genderSelect: "flex flex-col items-stretch gap-2 sm:inline-flex sm:flex-row sm:flex-wrap sm:items-center",
  genderLabel: "text-sm font-medium text-[var(--app-text-muted)]",
  genderButtons: "inline-flex gap-1",
  genderButton: [
    "rounded-lg border border-[var(--app-border-default)] bg-[var(--app-bg-surface)]",
    "px-3 py-2 text-sm font-semibold text-[var(--app-text)] transition-colors",
    "hover:border-violet-500/40 hover:bg-violet-600/5",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" "),
  genderButtonActive:
    "rounded-lg border border-violet-600 bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  verifyInlineShell:
    "rounded-lg border border-violet-500/20 bg-violet-600/5 p-3 sm:p-4",
  verifyInlineForm: "flex flex-col gap-3",
  verifyInlineTitle: "m-0 text-sm font-semibold text-[var(--app-text)]",
  verifyInlineDescription: "m-0 text-sm leading-relaxed text-[var(--app-text-muted)]",
  verifyReadyActions: "flex flex-col gap-3",
  uploadFormToggle: [
    "inline-flex w-full items-center justify-center rounded-lg border border-[var(--app-border-default)]",
    "bg-[var(--app-bg-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)]",
    "transition-colors hover:border-violet-500/40 hover:bg-violet-600/5 sm:w-auto",
  ].join(" "),
  uploadFormToggleActive: "border-violet-500/40 bg-violet-600/10",
  sampleCard:
    "flex flex-col gap-3 rounded-lg border border-[var(--app-border-subtle)] bg-[var(--app-bg-elevated)] p-3",
  sampleCardHeader: "flex flex-col gap-3 sm:flex-row sm:items-start",
  sampleCardBody: "min-w-0 flex-1",
  sampleCardTitle: "text-sm font-medium text-[var(--app-text)]",
  sampleCardMeta: `flex flex-wrap items-center gap-2 text-xs ${appShell.textMuted}`,
  sampleCardBadgeReady:
    "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400",
  sampleCardBadgePending:
    "rounded-full bg-[var(--app-hover-overlay)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-text-muted)]",
  sampleCardBadgeWarning:
    "rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300",
  sampleCardBadgeVerification:
    "rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400",
  sampleCardBadgeError:
    "rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300",
  sampleCardPlayer: "min-w-0 flex-1",
  sampleCardHint: "text-xs leading-snug text-amber-900 dark:text-amber-200",
  sampleCardPlayerReady: "opacity-100",
  sampleCardPlayerRow: "flex items-center gap-2",
  creationSection: "flex flex-col gap-4",
  creationSectionHeader: "flex flex-col gap-1.5",
  creationSectionTitleRow: "flex flex-wrap items-center gap-2",
  creationSectionTitle: "text-base font-semibold text-[var(--app-text)]",
  creationOptionalBadge:
    "rounded-full bg-[var(--app-hover-overlay)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[var(--app-text-muted)]",
  creationSectionHint: `text-sm ${appShell.textMuted}`,
  personalVoicePanel:
    "flex flex-col gap-3 rounded-lg border border-violet-500/25 bg-violet-600/5 p-4",
  personalVoiceContent: "flex flex-col gap-1",
  personalVoiceTitle: "m-0 text-sm font-semibold text-[var(--app-text)]",
  personalVoiceStatus: "m-0 text-sm text-amber-800 dark:text-amber-200",
  personalVoiceReady: "m-0 text-sm text-emerald-700 dark:text-emerald-300",
  personalVoiceError: "m-0 text-sm text-rose-600 dark:text-rose-400",
  personalVoiceButton: `${appShell.btnPrimary} px-5 w-full sm:w-auto`,
  personalVoiceActions: "flex flex-col gap-2 sm:flex-row sm:flex-wrap",
  upload: {
    hint: `text-sm ${appShell.textMuted} mb-1`,
    durationRecommendNotice:
      "text-xs leading-snug text-amber-900 dark:text-amber-200",
    submit: `${appShell.btnPrimary} w-full`,
    error: "text-sm text-rose-400",
    modeSwitch: "flex gap-1.5",
    modeButton: `${btnBase} flex-1 border-[var(--app-border-default)] bg-[var(--app-bg-surface)] text-[var(--app-text)]`,
    modeButtonActive: `${btnBase} flex-1 border-violet-600 bg-violet-600 text-white`,
    replaceWarning:
      "flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3",
    replaceWarningText: "m-0 text-sm text-amber-900 dark:text-amber-200",
    replaceWarningActions: "flex flex-col gap-2 sm:flex-row sm:flex-wrap",
    consentRow: "flex cursor-pointer items-start gap-2.5",
    consentNotice: "text-xs leading-snug text-amber-900 dark:text-amber-200",
    fileInput: appShell.formVoiceFileInput,
    form: "flex flex-col gap-3",
    field: "flex flex-col gap-1.5",
    recordRow: "flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center",
    recordButton: `${btnBase} inline-flex w-full items-center justify-center gap-2 border-violet-600 bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:border-violet-500 hover:bg-violet-500 disabled:border-violet-600/30 disabled:bg-violet-600/30 disabled:text-white/50 sm:w-auto`,
    recordButtonIcon: "h-4 w-4 shrink-0",
    recordingLabel: "text-[0.8125rem] text-[var(--app-text-muted)]",
    preview:
      "flex flex-col gap-2 rounded-lg border border-[var(--app-border-subtle)] bg-[var(--app-bg-elevated)] p-3",
    previewHeader: "flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between",
    previewPlayer: "h-10 w-full",
    fieldLabel: "mb-3 flex flex-col gap-1.5 text-sm text-[var(--app-text)]",
    toolButton: `${btnBase} border-[var(--app-border-default)] bg-[var(--app-bg-surface)] text-[var(--app-text)] hover:bg-[var(--app-hover-overlay)]`,
    toolButtonDestructive: `${btnBase} border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20`,
    primaryButton: `${btnBase} border-violet-600 bg-violet-600 text-white hover:bg-violet-500 hover:border-violet-500`,
  },
} as const;

