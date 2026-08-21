import { appShell } from "@/shared/theme/app-theme";

export const paymentReturn = {
  page: appShell.formPage,
  title: appShell.formPageTitle,
  description: appShell.formPageDescription,
  card: appShell.sectionCard,
  actions: "mt-6 flex flex-col gap-3 sm:flex-row",
  primary: appShell.btnPrimary,
  secondary: appShell.btnSecondary,
  error: "text-sm text-rose-700 dark:text-rose-300",
} as const;
