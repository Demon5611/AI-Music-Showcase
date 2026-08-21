export type StemSeparationNoticeKind = "plan_restricted" | "separation_failed";

const PLAN_RESTRICTED_PREFIX = "plan_restricted:";
const SEPARATION_FAILED_PREFIX = "separation_failed:";

const LEGACY_PLAN_RESTRICTED_MARKER = /доступна на тарифе Pro/i;

export const PLAN_RESTRICTED_STEM_MESSAGE =
  "Разделение vocal и instrumental временно недоступно. В редакторе используется полный микс на обеих дорожках.";

const SEPARATION_FAILED_BASE_MESSAGE =
  "Сервис не смог разделить трек — в редакторе используется полный микс на обеих дорожках.";

export interface ParsedStemSeparationNotice {
  kind: StemSeparationNoticeKind;
  message: string;
}

export function buildPlanRestrictedStemNotice(): string {
  return `${PLAN_RESTRICTED_PREFIX}${PLAN_RESTRICTED_STEM_MESSAGE}`;
}

export function buildSeparationFailedStemNotice(detail?: string | null): string {
  const trimmedDetail = detail?.trim();
  const message = trimmedDetail
    ? `${SEPARATION_FAILED_BASE_MESSAGE} Причина: ${trimmedDetail}`
    : SEPARATION_FAILED_BASE_MESSAGE;

  return `${SEPARATION_FAILED_PREFIX}${message}`;
}

export function parseStemSeparationNotice(
  notice: string | null | undefined,
): ParsedStemSeparationNotice | null {
  const trimmed = notice?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(PLAN_RESTRICTED_PREFIX)) {
    return {
      kind: "plan_restricted",
      message: trimmed.slice(PLAN_RESTRICTED_PREFIX.length),
    };
  }

  if (trimmed.startsWith(SEPARATION_FAILED_PREFIX)) {
    return {
      kind: "separation_failed",
      message: trimmed.slice(SEPARATION_FAILED_PREFIX.length),
    };
  }

  if (LEGACY_PLAN_RESTRICTED_MARKER.test(trimmed)) {
    return {
      kind: "plan_restricted",
      message: PLAN_RESTRICTED_STEM_MESSAGE,
    };
  }

  return {
    kind: "separation_failed",
    message: trimmed,
  };
}

export function isPlanRestrictedStemNotice(notice: string | null | undefined): boolean {
  return parseStemSeparationNotice(notice)?.kind === "plan_restricted";
}
