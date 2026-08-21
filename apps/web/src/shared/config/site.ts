/**
 * Canonical public site origin for metadata / SEO.
 * Override with NEXT_PUBLIC_SITE_URL when needed (preview, staging).
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://example.com"
).replace(/\/$/, "");

export {
  PUBLIC_SUPPORT_EMAIL,
  supportMailtoHref,
} from "@/shared/config/public-support";

export {
  LEGAL_DOCUMENT_DATES,
  LEGAL_ENTITY,
  LEGAL_ENV_KEYS,
  assertLegalEntityReadyForProduction,
  isLegalPlaceholder,
  listUnresolvedLegalEntityFields,
  warnLegalEntityPlaceholdersInDevelopment,
  type LegalDocumentId,
} from "@/shared/config/legal";
