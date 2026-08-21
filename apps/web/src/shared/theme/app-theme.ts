/**
 * App shell Tailwind classes driven by CSS variables in globals.css.
 * Toggle light/dark via ThemeProvider (class on <html>).
 */
const fieldFocus =
  "focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20";

const fieldFocusEmerald =
  "focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20";

const fieldBase = [
  "rounded-xl border border-[var(--app-field-border)] bg-[var(--app-field-bg)]",
  "text-sm text-[var(--app-text)] outline-none transition-all",
  "placeholder:text-[var(--app-text-subtle)]",
  fieldFocus,
].join(" ");

export const appShell = {
  bgPage: "bg-[var(--app-bg-page)]",
  bgPage80: "bg-[var(--app-bg-page)]/80",
  bgElevated: "bg-[var(--app-bg-elevated)]",
  bgSurface: "bg-[var(--app-bg-surface)]",
  textPrimary: "text-[var(--app-text)]",
  textMuted: "text-[var(--app-text-muted)]",
  textSubtle: "text-[var(--app-text-subtle)]",
  borderSubtle: "border-[var(--app-border-subtle)]",
  borderDefault: "border-[var(--app-border-default)]",
  page: "flex-1 w-full bg-[var(--app-bg-page)] text-[var(--app-text)]",
  pageHeader:
    "sticky top-0 z-10 flex items-center justify-between border-b border-[var(--app-border-subtle)] bg-[var(--app-bg-page)]/80 px-4 py-3 backdrop-blur sm:px-6",
  pageHeaderLogo:
    "flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white",
  sectionCard:
    "rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-bg-surface)] p-4 sm:p-6",
  surfaceCard:
    "rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-bg-surface)]",
  promptCard: [
    "flex flex-col bg-[var(--app-bg-surface)] border border-[var(--app-border-default)]",
    "rounded-2xl overflow-hidden shadow-2xl shadow-[var(--app-shadow)]",
    "focus-within:border-violet-500/50 transition-colors",
  ].join(" "),
  fieldInput: `w-full px-4 py-2.5 ${fieldBase}`,
  fieldTextarea: `w-full resize-none px-4 py-2.5 ${fieldBase}`,
  fieldTextareaLarge: `h-44 w-full resize-none px-4 py-3 ${fieldBase}`,
  fieldSelect: `w-full cursor-pointer appearance-none py-2.5 pl-9 pr-8 ${fieldBase}`,
  btnPrimary:
    "flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-violet-600/30 disabled:text-white/40",
  btnPrimarySm:
    "flex items-center gap-2 bg-violet-600 hover:bg-violet-500 active:scale-95 transition-all px-5 py-2 rounded-xl text-sm font-semibold text-white",
  btnPrimaryPill:
    "flex items-center gap-2 bg-violet-600 hover:bg-violet-500 active:scale-95 transition-all px-6 py-3 rounded-full text-sm font-semibold text-white",
  btnSecondary:
    "rounded-full border border-[var(--app-border-default)] bg-[var(--app-hover-overlay)] px-4 py-2 text-sm font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover-overlay-strong)] disabled:cursor-not-allowed disabled:opacity-50",
  btnSecondaryOutline:
    "px-6 py-3 rounded-full text-sm font-medium border border-[var(--app-border-default)] hover:border-[var(--app-border-strong)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-all",
  chip:
    "inline-flex cursor-pointer items-center rounded-full border border-[var(--app-border-default)] bg-[var(--app-hover-overlay)] px-2.5 py-1 text-xs text-[var(--app-text)] transition-colors",
  chipSelected:
    "inline-flex cursor-pointer items-center rounded-full border border-violet-500/40 bg-violet-600/15 px-2.5 py-1 text-xs text-violet-500 dark:text-violet-400 transition-colors",
  chipDisabled: "cursor-not-allowed opacity-45",
  modeToggle:
    "flex items-center gap-2 rounded-lg border border-[var(--app-border-default)] bg-[var(--app-hover-overlay)] px-3 py-1.5 text-xs font-medium text-[var(--app-text-muted)] transition-all hover:text-[var(--app-text)]",
  modeToggleActive:
    "flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-600/15 px-3 py-1.5 text-xs font-medium text-violet-500 dark:text-violet-400 transition-all",
  spinner: "h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent",
  loaderWrap: "mt-4 rounded-xl border border-violet-500/15 bg-violet-600/5 p-4",
  charCounter: "text-xs tabular-nums text-neutral-500",
  charCounterLimit: "text-xs tabular-nums text-rose-400",
  accentCheckbox: "h-4 w-4 cursor-pointer accent-violet-600",
  heroGlow:
    "pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/4 h-[280px] w-[min(100vw,700px)] rounded-full opacity-30 blur-[80px] bg-[var(--app-hero-glow)] sm:h-[400px] sm:blur-[100px] md:h-[500px] md:blur-[120px]",
  iconButton:
    "p-2 rounded-lg text-[var(--app-text-subtle)] hover:text-[var(--app-text)] hover:bg-[var(--app-hover-overlay)] transition-all",
  hoverRow: "hover:bg-[var(--app-hover-overlay)] transition-colors",
  formPage:
    "mx-auto flex max-w-xl flex-1 flex-col gap-4 px-4 py-6 pb-10 sm:px-6 sm:py-8 sm:pb-12",
  formPageTitle:
    "text-2xl font-semibold text-[var(--app-text)] sm:text-[1.75rem]",
  formPageDescription: "leading-relaxed text-[var(--app-text-muted)]",
  formPageForm: "flex flex-col gap-4",
  formField: "flex flex-col gap-1.5",
  formLabel: "text-sm text-[var(--app-text)]",
  formFileInput: `w-full cursor-pointer ${fieldBase} file:mr-3 file:rounded-md file:border-0 file:bg-[var(--app-hover-overlay)] file:px-3 file:py-1 file:text-sm file:text-[var(--app-text)]`,
  formVoiceFileInput: [
    "w-full cursor-pointer rounded-xl border border-emerald-500/50 bg-[var(--app-field-bg)]",
    "text-sm text-[var(--app-text)] outline-none transition-all",
    fieldFocusEmerald,
    "file:mr-3 file:rounded-md file:border-0 file:bg-[var(--app-hover-overlay)]",
    "file:px-3 file:py-1 file:text-sm file:text-[var(--app-text)]",
  ].join(" "),
  formSubmit:
    "inline-flex w-full items-center justify-center self-stretch rounded-full bg-violet-600 px-5 py-2.5 text-sm font-medium text-white no-underline transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:self-start",
  formStatus: "text-sm text-[var(--app-text-muted)]",
  formMeta: "text-sm text-[var(--app-text-muted)]",
  formHint:
    "text-sm text-[var(--app-text-muted)] [&_a]:text-[var(--app-text)] [&_a]:underline-offset-2 hover:[&_a]:underline",
  formConsentRow: "flex cursor-pointer items-start gap-2.5",
  formConsentText: "text-sm leading-snug text-[var(--app-text-muted)]",
  formConsentNotice: "text-xs leading-snug text-amber-900 dark:text-amber-200",
  formError: "text-sm text-rose-600 dark:text-rose-400",
  formModelList: "mt-2 flex flex-col gap-2",
  formModelOption:
    "flex w-full cursor-pointer items-center gap-2 rounded-lg border border-[var(--app-border-default)] bg-[var(--app-bg-surface)] px-3 py-2 text-left text-sm text-[var(--app-text)] transition-colors hover:border-[var(--app-border-strong)]",
  formModelOptionSelected:
    "flex w-full cursor-pointer items-center gap-2 rounded-lg border border-violet-500 bg-violet-600/10 px-3 py-2 text-left text-sm text-[var(--app-text)]",
  siteHeader:
    "border-b border-[var(--app-border-subtle)] bg-[var(--app-bg-page)]",
  siteHeaderBar:
    "grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 sm:px-6 sm:py-4",
  siteHeaderLogo:
    "max-w-[45vw] justify-self-start truncate text-base font-semibold text-[var(--app-text)] no-underline sm:max-w-none sm:text-lg",
  siteHeaderNav: "hidden items-center justify-center gap-4 md:flex",
  siteHeaderNavMobile:
    "flex flex-col gap-0.5 border-t border-[var(--app-border-subtle)] px-4 py-3 md:hidden",
  siteHeaderNavLink:
    "rounded-md px-2 py-2 text-sm text-[var(--app-text-muted)] no-underline transition-colors hover:bg-[var(--app-hover-overlay)] hover:text-[var(--app-text)] md:p-0 md:hover:bg-transparent",
  siteHeaderActions: "flex shrink-0 items-center justify-self-end gap-2 sm:gap-3",
  siteHeaderAuthActions: "flex items-center gap-1.5 sm:gap-2",
  siteHeaderMenuButton:
    "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--app-text-subtle)] transition-colors hover:bg-[var(--app-hover-overlay)] hover:text-[var(--app-text)] md:hidden",
  siteHeaderMenuIcon: "h-5 w-5",
  siteHeaderAuthButton:
    "cursor-pointer rounded-md border border-[var(--app-border-strong)] bg-transparent px-2.5 py-1.5 text-xs text-[var(--app-text)] sm:px-3 sm:text-sm",
  siteHeaderAuthButtonPrimary:
    "cursor-pointer rounded-md border border-violet-600 bg-violet-600 px-2.5 py-1.5 text-xs text-white transition-colors hover:border-violet-500 hover:bg-violet-500 sm:px-3 sm:text-sm",
  siteHeaderDevBadge:
    "rounded-md border border-dashed border-[var(--app-border-strong)] px-2 py-1 text-xs text-[var(--app-text-subtle)]",
  placeholderPage:
    "mx-auto flex max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-10 sm:px-6 sm:py-12",
  placeholderPageTitle:
    "text-2xl font-semibold text-[var(--app-text)] sm:text-3xl",
  placeholderPageDescription: "text-base leading-relaxed text-[var(--app-text-muted)]",
  authPage: "flex flex-1 items-center justify-center px-4 py-8",
  deleteIconButton:
    "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[var(--app-border-default)] bg-[var(--app-bg-surface)] p-0 text-[var(--app-text-muted)] transition-colors hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:border-rose-900 dark:hover:text-rose-400",
  deleteIcon: "h-4 w-4",
  themeToggleGroup:
    "inline-flex items-center gap-0.5 rounded-full border border-[var(--app-border-default)] bg-[var(--app-bg-surface)] p-0.5",
  themeToggleButton:
    "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-hover-overlay)] hover:text-[var(--app-text)]",
  themeToggleButtonActive:
    "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--app-hover-overlay)] text-[var(--app-text)]",
  themeToggleIcon: "h-3.5 w-3.5",
  themeTogglePlaceholder: "inline-block h-8 w-[5.75rem]",
  languageSwitcher: "inline-flex items-center gap-0.5",
  languageSwitcherDivider: "px-0.5 text-xs text-[var(--app-text-subtle)]",
  languageSwitcherButton:
    "cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-1 text-xs font-medium tracking-wide text-[var(--app-text-muted)] transition-colors hover:text-[var(--app-text)]",
  languageSwitcherButtonActive: "font-semibold text-[var(--app-text)]",
  languageSwitcherPlaceholder: "inline-block h-7 min-w-14",
  siteHeaderCredits: "hidden items-center gap-3 md:flex",
  siteHeaderCreditsLabel: "whitespace-nowrap text-sm tabular-nums text-[var(--app-text-muted)]",
  siteHeaderCreditsTopUp:
    "whitespace-nowrap text-sm font-medium text-[var(--app-text)] underline-offset-4 transition-colors hover:underline",
  siteHeaderCreditsSkeletonLabel: "h-4 w-28 rounded-md",
  siteHeaderCreditsSkeletonCta: "h-4 w-16 rounded-md",
  siteFooter:
    "mt-auto border-t border-[var(--app-border-subtle)] bg-[var(--app-bg-page)]",
  siteFooterInner:
    "mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-6",
  siteFooterSupport: "flex flex-col gap-1",
  siteFooterSupportLabel: "text-xs font-medium uppercase tracking-wide text-[var(--app-text-subtle)]",
  siteFooterEmailLink:
    "text-sm text-[var(--app-text)] underline-offset-2 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-text)]",
  siteFooterNav: "flex flex-wrap items-center gap-x-4 gap-y-2",
  siteFooterNavLink:
    "text-sm text-[var(--app-text-muted)] no-underline transition-colors hover:text-[var(--app-text)]",
} as const;
