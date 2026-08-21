import { appShell } from "@/shared/theme/app-theme";

/** Profile page — Tailwind via app tokens. */
export const pf = {
  section: "mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-8",
  title: "mb-6 text-2xl font-semibold text-[var(--app-text)] sm:text-[1.75rem]",
  details: "mb-8 flex flex-col gap-4",
  row: "flex flex-col gap-1 sm:grid sm:grid-cols-[6rem_1fr] sm:items-baseline sm:gap-3",
  rowWide:
    "flex flex-col gap-1 sm:grid sm:grid-cols-[9rem_1fr] sm:items-baseline sm:gap-3",
  label: "text-sm text-[var(--app-text-muted)]",
  labelWide: "text-sm text-[var(--app-text-muted)]",
  value: "text-[0.9375rem] text-[var(--app-text)]",
  actions: "flex flex-col gap-3 sm:flex-row sm:flex-wrap",
  primaryLink: appShell.formSubmit,
  secondaryLink: appShell.btnSecondary,
  status: "px-4 py-8 text-[var(--app-text-muted)] sm:px-6",
  errorBox: "mx-auto max-w-lg px-4 py-8 sm:px-6",
  error: "mb-3 text-sm text-rose-600 dark:text-rose-400",
  hint: "text-sm text-[var(--app-text-muted)]",
  billingNote: "mb-4 text-sm text-[var(--app-text-muted)]",
  historyNote: "mt-4 text-sm text-[var(--app-text-muted)]",
  voiceSection:
    "mb-8 flex flex-col gap-3 rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-bg-surface)] p-4 sm:p-5",
  voiceTitle: "m-0 text-base font-semibold text-[var(--app-text)]",
  voiceStatus: "m-0 text-sm text-emerald-700 dark:text-emerald-300",
  voiceHint: "m-0 text-sm text-[var(--app-text-muted)]",
  voiceError: "m-0 text-sm text-rose-600 dark:text-rose-400",
  voiceConfirm:
    "flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4",
  voiceConfirmTitle: "m-0 text-sm font-semibold text-[var(--app-text)]",
  voiceConfirmActions: "flex flex-col gap-2 sm:flex-row sm:flex-wrap",
  voiceCancelButton: `${appShell.btnSecondaryOutline} w-full sm:w-auto`,
  voiceDeleteButton:
    "flex w-full items-center justify-center rounded-xl border border-rose-500/40 bg-rose-600/10 px-4 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-600/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300 sm:w-auto",
  dangerSection:
    "mb-8 flex flex-col gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4 sm:p-5",
  dangerTitle: "m-0 text-base font-semibold text-[var(--app-text)]",
  dangerStatus: "m-0 text-sm text-amber-800 dark:text-amber-200",
} as const;
