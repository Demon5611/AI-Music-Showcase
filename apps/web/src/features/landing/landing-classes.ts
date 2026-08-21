import { appShell } from "@/shared/theme/app-theme";

/** Shared Tailwind classes for landing page. */
export const lp = {
  page: `${appShell.page} overflow-x-hidden`,
  heroGlow: appShell.heroGlow,
  heroSection:
    "relative flex flex-col items-center text-center px-4 pt-12 pb-12 sm:pt-16 md:pt-20 md:pb-16",
  eyebrow: "relative z-10 text-xs font-semibold uppercase tracking-[0.2em] text-violet-400 mb-4 sm:mb-5",
  title:
    "relative z-10 text-4xl sm:text-5xl md:text-7xl font-extrabold leading-[1.08] tracking-tight max-w-3xl mb-5 sm:mb-6 text-[var(--app-text)]",
  titleGradient:
    "text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-300 to-violet-400",
  subtitle: `relative z-10 text-sm sm:text-base md:text-lg ${appShell.textSubtle} max-w-lg mb-8 sm:mb-10 leading-relaxed px-1`,
  voiceWrap: "relative z-10 w-full max-w-2xl mb-4 text-left",
  voicePathShell: [
    "overflow-hidden rounded-2xl border border-[var(--app-border-default)]",
    "bg-[var(--app-bg-surface)] shadow-2xl shadow-[var(--app-shadow)]",
  ].join(" "),
  voiceCard: "p-3 sm:p-4 md:p-5",
  standardPathFork:
    "flex flex-col items-stretch gap-3 border-t border-[var(--app-border-default)] px-3 pb-4 pt-3 sm:px-4 sm:pb-5 md:px-5",
  standardPathOrRow: "flex items-center gap-3",
  standardPathOrLine: "h-px flex-1 bg-[var(--app-border-default)]",
  standardPathOrLabel: `shrink-0 text-xs font-semibold uppercase tracking-[0.18em] ${appShell.textMuted}`,
  standardPathCopy: "flex flex-col gap-1 text-center",
  standardPathLead: "m-0 text-sm font-medium text-[var(--app-text)] sm:text-base",
  standardPathHint: `m-0 text-sm leading-relaxed ${appShell.textMuted}`,
  standardPathButton: `${appShell.btnPrimary} w-full justify-center`,
  note: `relative z-10 text-xs ${appShell.textSubtle} px-2 text-center sm:px-0`,
  statsGrid:
    "relative z-10 mx-2 sm:mx-4 md:mx-auto md:max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--app-hover-overlay)] rounded-2xl overflow-hidden mb-12 sm:mb-20",
  statCell: `${appShell.bgElevated} px-4 py-3 sm:px-6 sm:py-4 flex flex-col gap-0.5`,
  statLabel: `text-[10px] sm:text-xs ${appShell.textSubtle} uppercase tracking-wider`,
  statValue: "text-lg sm:text-xl font-bold tabular-nums",
  statUnit: `${appShell.textMuted} text-xs sm:text-sm font-normal`,
  ctaSection: "text-center px-4 pb-16 sm:pb-24",
  ctaSubtitle: `${appShell.textMuted} text-sm mb-6 sm:mb-8 max-w-xs mx-auto`,
  ctaActions: "flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full sm:w-auto max-w-xs sm:max-w-none mx-auto",
  ctaPrimary: `${appShell.btnPrimaryPill} w-full sm:w-auto justify-center`,
  ctaSecondary: `${appShell.btnSecondaryOutline} w-full sm:w-auto justify-center`,
} as const;
