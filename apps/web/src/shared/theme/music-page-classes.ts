import { appShell } from "@/shared/theme/app-theme";

/** Shared page chrome for music create and history screens. */
export const mp = {
  page: appShell.page,
  pageHeader: appShell.pageHeader,
  pageHeaderBrand: "flex items-center gap-2",
  pageHeaderLogo: appShell.pageHeaderLogo,
  pageHeaderTitle: "text-sm font-semibold tracking-tight",
  pageHeaderMeta: `text-xs ${appShell.textMuted}`,
  pageMain: "mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:gap-5 sm:py-8",
  authLoading: `flex flex-1 items-center justify-center ${appShell.bgPage} py-24`,
  authLoadingInner: `flex items-center gap-3 text-sm ${appShell.textMuted}`,
  spinner: appShell.spinner,
  alertError:
    "rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300",
  alertWarning:
    "rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300",
  inlineCode: "rounded bg-[var(--app-hover-overlay)] px-1 font-mono",
  sectionCard: appShell.sectionCard,
  icon: "h-4 w-4",
  iconSmall: "h-3 w-3",
} as const;
