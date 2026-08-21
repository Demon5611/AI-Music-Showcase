import {
  FREE_DEMO_CREDITS,
  STANDARD_MUSIC_GENERATION_EXAMPLE_CREDITS,
} from "./credits-economy.js";

export type PlanId = "free" | "pro" | "studio";

export type PaidPlanId = Exclude<PlanId, "free">;

export type EditorLevel = "lite" | "advanced";

export type MusicGenerationLevel = "simplified" | "full";

export type VersionHistoryLevel = false | "standard" | "extended";

export interface PlanFeatures {
  musicGeneration: MusicGenerationLevel;
  voiceReplace: boolean;
  lyricsGeneration: boolean;
  karaokeSync: boolean;
  albumCover: boolean;
  editor: EditorLevel;
  stemSeparation: boolean;
  wavExport: boolean;
  aiRemix: boolean;
  voicePresets: boolean;
  priorityQueue: boolean;
  versionHistory: VersionHistoryLevel;
  maxProjects: number | null;
  earlyAccess: boolean;
  apiAccess: boolean;
}

export interface PlanConfig {
  id: PlanId;
  label: string;
  priceUsd: number;
  /** One-time free grant or legacy subscription grant amount (not pack marketing SoT). */
  monthlyCredits: number;
  maxTrackDurationSec: number;
  estimatedFlows: number | null;
  features: PlanFeatures;
}

export const LITE_EDITOR_OPERATIONS = [
  "SPLIT_REGION",
  "MOVE_REGION",
  "MOVE_TRACK_REGION",
  "FADE",
  "SET_VOLUME",
  "MUTE_TRACK",
  "SOLO_TRACK",
] as const;

export const ADVANCED_EDITOR_OPERATIONS = [
  "DELETE_REGION",
  "DELETE_RANGE",
  "DUPLICATE_REGION",
  "RESIZE_REGION",
  "RESIZE_TRACK_REGION",
] as const;

/** @deprecated Use LITE_EDITOR_OPERATIONS */
export const BASIC_EDITOR_OPERATIONS = LITE_EDITOR_OPERATIONS;

export type LiteEditorOperation = (typeof LITE_EDITOR_OPERATIONS)[number];
export type AdvancedEditorOperation = (typeof ADVANCED_EDITOR_OPERATIONS)[number];
export type EditorOperationType = LiteEditorOperation | AdvancedEditorOperation;

/**
 * Safety undo/redo depth for all accounts (not pack marketing).
 * Extended = no soft product limit; infra still has UNLIMITED_PROJECTS_CAP-style caps elsewhere.
 */
export const VERSION_HISTORY_OPERATION_LIMIT: Record<
  Exclude<VersionHistoryLevel, false>,
  number | null
> = {
  standard: 50,
  extended: null,
};

function estimateMarketingFlows(credits: number): number {
  return Math.floor(credits / STANDARD_MUSIC_GENERATION_EXAMPLE_CREDITS);
}

/**
 * Core AI tools are identical for every plan / pack.
 * Packs differ by prepaid credit balance and unit price only.
 */
const ALL_TOOLS_FEATURES = {
  musicGeneration: "full",
  voiceReplace: true,
  lyricsGeneration: true,
  karaokeSync: true,
  albumCover: true,
  editor: "advanced",
  stemSeparation: true,
  wavExport: true,
  aiRemix: true,
  voicePresets: true,
  /** No pack-based queue privilege — infra rate limits still apply globally. */
  priorityQueue: false,
  /** Same undo depth for all; null = no soft product limit. */
  versionHistory: "extended" as const,
  /**
   * Same project history safety ceiling for all packs.
   * null → resolveMaxProjects uses UNLIMITED_PROJECTS_CAP (abuse/storage safety).
   */
  maxProjects: null,
  earlyAccess: false,
  apiAccess: false,
} as const satisfies PlanFeatures;

/** Practical upper bound when `maxProjects` is unlimited (`null`). */
export const UNLIMITED_PROJECTS_CAP = 10_000;

/**
 * Entitlements plan ids (free / pro / studio) — store labels only, not purchasable
 * subscriptions. Admin/QA may override; default signup is free.
 * Prepaid marketing packs live in `credit-packages.ts` (starter / creator / studio).
 * Tool entitlements are identical across these rows.
 */
export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    label: "Free",
    priceUsd: 0,
    monthlyCredits: FREE_DEMO_CREDITS,
    maxTrackDurationSec: 180,
    estimatedFlows: estimateMarketingFlows(FREE_DEMO_CREDITS),
    features: { ...ALL_TOOLS_FEATURES },
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceUsd: 19,
    monthlyCredits: 500,
    maxTrackDurationSec: 180,
    estimatedFlows: estimateMarketingFlows(500),
    features: { ...ALL_TOOLS_FEATURES },
  },
  studio: {
    id: "studio",
    label: "Studio",
    priceUsd: 49,
    monthlyCredits: 2000,
    maxTrackDurationSec: 180,
    estimatedFlows: estimateMarketingFlows(2000),
    features: { ...ALL_TOOLS_FEATURES },
  },
} as const;

export const PAID_PLAN_IDS = ["pro", "studio"] as const satisfies readonly PaidPlanId[];

export const PLAN_UPGRADE_ORDER: PlanId[] = ["free", "pro", "studio"];

export function getMinimumPlanForFeature(feature: keyof PlanFeatures): PlanId {
  for (const planId of PLAN_UPGRADE_ORDER) {
    const value = PLANS[planId].features[feature];

    if (feature === "editor") {
      if (value === "advanced") {
        return planId;
      }
      continue;
    }

    if (feature === "musicGeneration") {
      if (value === "full") {
        return planId;
      }
      continue;
    }

    if (feature === "versionHistory") {
      if (value !== false) {
        return planId;
      }
      continue;
    }

    if (feature === "maxProjects") {
      if (value === null) {
        return planId;
      }
      continue;
    }

    if (value === true || (typeof value === "number" && value > 0)) {
      return planId;
    }
  }

  return "studio";
}

export function getPlanLabel(planId: PlanId): string {
  return PLANS[planId].label;
}

export function getPlanFeatureTooltip(feature: keyof PlanFeatures): string {
  if (
    feature === "maxProjects" ||
    feature === "priorityQueue" ||
    feature === "versionHistory"
  ) {
    return "Основные инструменты доступны на всех пакетах. Купите больше credits при необходимости.";
  }

  return "Все AI-инструменты доступны. Нужны кредиты для операций.";
}

/** Unified safety limit for /history visibility and editor Song creation. */
export function resolveMaxProjects(planId: PlanId): number {
  const maxProjects = PLANS[planId].features.maxProjects;

  if (maxProjects === null) {
    return UNLIMITED_PROJECTS_CAP;
  }

  return maxProjects;
}

export function isUnlimitedProjects(planId: PlanId): boolean {
  return PLANS[planId].features.maxProjects === null;
}
