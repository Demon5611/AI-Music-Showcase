/**
 * Public prepaid credit packages (one-time purchase model).
 *
 * Commercial rule: Free / Starter / Creator / Studio share the same core tools.
 * Packs differ only by credit balance and price per credit.
 *
 * Prepaid credit packs — not entitlement plan ids; do not use for backend feature gating.
 */

import { FREE_DEMO_CREDITS } from "./credits-economy.js";

export const SHARED_AI_TOOLS = [
  "Generate",
  "Extend",
  "Voice Replace",
  "Stem Separation",
  "Editor",
  "Export",
  "AI Lyrics",
] as const;

export const FREE_CREDIT_OFFER = {
  id: "free",
  name: "Free",
  priceUsd: 0,
  credits: FREE_DEMO_CREDITS,
} as const;

export const CREDIT_PACKAGES = [
  {
    id: "starter",
    name: "Starter Pack",
    priceUsd: 9,
    credits: 500,
    bestValue: false,
    featured: false,
  },
  {
    id: "creator",
    name: "Creator Pack",
    priceUsd: 29,
    credits: 2000,
    bestValue: false,
    featured: true,
  },
  {
    id: "studio",
    name: "Studio Pack",
    priceUsd: 99,
    credits: 8000,
    bestValue: true,
    featured: false,
  },
] as const;

export type CreditPackageId = (typeof CREDIT_PACKAGES)[number]["id"];

export type CreditPackage = (typeof CREDIT_PACKAGES)[number];

export function getCreditPackage(id: CreditPackageId): CreditPackage {
  const pkg = CREDIT_PACKAGES.find((item) => item.id === id);

  if (!pkg) {
    throw new Error(`Unknown credit package: ${id}`);
  }

  return pkg;
}

/** Commercial SoT is USD. GEL is quoted at checkout via FX — never a fixed pack GEL price. */
export function getCreditPackagePriceUsd(id: CreditPackageId): number {
  return getCreditPackage(id).priceUsd;
}

/** @deprecated Use getCreditPackagePriceUsd. GEL is not a SoT currency. */
export function getCreditPackagePriceMajor(
  id: CreditPackageId,
  currency: "USD" = "USD",
): number {
  if (currency !== "USD") {
    throw new Error("Credit pack commercial SoT is USD; GEL is quoted at checkout");
  }
  return getCreditPackagePriceUsd(id);
}

export function pricePerCreditUsd(priceUsd: number, credits: number): number {
  if (credits <= 0) {
    return 0;
  }

  return priceUsd / credits;
}

/** Starter pack unit price — baseline for savings %. */
export function starterPricePerCreditUsd(): number {
  const starter = getCreditPackage("starter");
  return pricePerCreditUsd(starter.priceUsd, starter.credits);
}

/**
 * Percent cheaper per credit vs Starter, rounded to nearest integer.
 * Returns null for Starter itself.
 */
export function savingsPercentVsStarter(priceUsd: number, credits: number): number | null {
  const starterPpc = starterPricePerCreditUsd();

  if (starterPpc <= 0) {
    return null;
  }

  const ppc = pricePerCreditUsd(priceUsd, credits);

  if (ppc <= 0 || Math.abs(ppc - starterPpc) < Number.EPSILON) {
    return null;
  }

  return Math.round(((starterPpc - ppc) / starterPpc) * 100);
}

export function getPackageSavingsPercent(id: CreditPackageId): number | null {
  const pkg = getCreditPackage(id);
  return savingsPercentVsStarter(pkg.priceUsd, pkg.credits);
}

/** Canonical English copy for shared tests / docs. UI uses next-intl. */
export const CREDIT_PACKAGES_COPY_EN = {
  headline:
    "Buy prepaid credits for AI music generation and audio processing. One-time purchase. No subscription or automatic renewal.",
  explanation:
    "Credits are used for paid AI operations such as music generation, creating a Personal AI Voice, stem separation, and other AI tools. Manual Music Editor actions, reuse of an existing Personal AI Voice, and MP3/WAV export do not consume credits.",
  freeDescription: "Try the core AI generation flow",
  buyCta: "Buy credits",
  startFreeCta: "Start for free",
  bestValue: "Best value",
  enoughForVoice: "Enough credits to create a Personal AI Voice",
  voiceAvailableFrom: (credits: number) =>
    `Personal AI Voice available from ${credits} credits`,
  saveVsStarter: (percent: number) =>
    `≈${percent}% cheaper per credit than Starter`,
} as const;

/** Russian copy for shared tests / docs. UI uses next-intl. */
export const CREDIT_PACKAGES_COPY_RU = {
  title: "Пакеты кредитов",
  headline:
    "Покупайте предоплаченные кредиты для AI-генерации музыки и обработки аудио. Разовая покупка. Без подписки и автоматического продления.",
  explanation:
    "Кредиты расходуются на платные AI-операции: генерацию музыки, создание персонального AI-голоса, разделение дорожек и другие AI-инструменты. Ручное редактирование в Music Editor, повторное использование уже созданного персонального AI-голоса и экспорт MP3/WAV не требуют кредитов.",
  freeDescription: "Попробуйте основной сценарий AI-генерации",
  buyCta: "Купить кредиты",
  startFreeCta: "Начать бесплатно",
  bestValue: "Лучшая цена",
  enoughForVoice: "Хватает на создание персонального AI-голоса",
  voiceAvailableFrom: (credits: number) =>
    `Персональный AI-голос доступен от ${credits} кредитов`,
  saveVsStarter: (percent: number) =>
    `≈${percent}% дешевле за кредит, чем Starter`,
} as const;
