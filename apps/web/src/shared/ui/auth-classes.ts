import { appShell } from "@/shared/theme/app-theme";

export const authUi = {
  gate: "flex flex-col gap-3",
  gateTitle: "text-sm font-semibold text-[var(--app-text)]",
  gateHint: `text-sm leading-relaxed ${appShell.textMuted}`,
  gateActions: "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center",
  pageShell: `flex flex-1 items-center justify-center ${appShell.bgPage} py-24`,
  pageInner: "mx-auto flex w-full max-w-md flex-col gap-4 px-4",
  loadingInner: `flex items-center gap-3 text-sm ${appShell.textMuted}`,
  spinner: appShell.spinner,
} as const;
