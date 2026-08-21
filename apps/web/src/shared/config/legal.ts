/**
 * Centralized legal / business identity for public legal pages (showcase).
 *
 * Real trader / registry details are intentionally replaced with demo
 * placeholders in this public portfolio repository.
 */

import { PUBLIC_SUPPORT_EMAIL } from "@/shared/config/public-support";

const PLACEHOLDER_PATTERN = /^\[[^\]]+\]$/;

/** Showcase-only legal registry placeholders — not a real trader record. */
export const LEGAL_REGISTRY = {
  registeredName: "Demo Individual Entrepreneur",
  legalForm: "Individual Entrepreneur",
  country: "Demo Country",
  identificationNumber: "000000000",
  registrationDate: "01/01/2026",
  registeringAuthority: "Demo Public Registry",
  legalAddress: "Demo Country, Demo City, Demo Street 1",
} as const;

function readPublicField(envValue: string | undefined, canonical: string): string {
  const trimmed = envValue?.trim();
  if (!trimmed || PLACEHOLDER_PATTERN.test(trimmed)) {
    return canonical;
  }
  return trimmed;
}

export const LEGAL_ENTITY = {
  displayName: readPublicField(
    process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME,
    LEGAL_REGISTRY.registeredName,
  ),
  identificationNumber: readPublicField(
    process.env.NEXT_PUBLIC_LEGAL_ENTITY_ID,
    LEGAL_REGISTRY.identificationNumber,
  ),
  businessAddress: readPublicField(
    process.env.NEXT_PUBLIC_LEGAL_BUSINESS_ADDRESS,
    LEGAL_REGISTRY.legalAddress,
  ),
  registrationDate: LEGAL_REGISTRY.registrationDate,
  registeringAuthority: LEGAL_REGISTRY.registeringAuthority,
  supportEmail: PUBLIC_SUPPORT_EMAIL,
  /** Product / service trade name — not the registered legal entity name */
  serviceName: "AI Music (Showcase)",
  countryCode: "XX",
} as const;

/** Fixed publication dates — do not derive from `new Date()` at build time. */
export const LEGAL_DOCUMENT_DATES = {
  terms: "2026-08-20",
  privacy: "2026-08-20",
  refund: "2026-08-20",
} as const;

export type LegalDocumentId = keyof typeof LEGAL_DOCUMENT_DATES;

export const LEGAL_ENV_KEYS = [
  "NEXT_PUBLIC_LEGAL_ENTITY_NAME",
  "NEXT_PUBLIC_LEGAL_ENTITY_ID",
  "NEXT_PUBLIC_LEGAL_BUSINESS_ADDRESS",
] as const;

export function isLegalPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim());
}

export function listUnresolvedLegalEntityFields(): string[] {
  const checks: Array<{ key: (typeof LEGAL_ENV_KEYS)[number]; value: string }> = [
    { key: "NEXT_PUBLIC_LEGAL_ENTITY_NAME", value: LEGAL_ENTITY.displayName },
    { key: "NEXT_PUBLIC_LEGAL_ENTITY_ID", value: LEGAL_ENTITY.identificationNumber },
    { key: "NEXT_PUBLIC_LEGAL_BUSINESS_ADDRESS", value: LEGAL_ENTITY.businessAddress },
  ];

  return checks.filter((item) => isLegalPlaceholder(item.value)).map((item) => item.key);
}

export function assertLegalEntityReadyForProduction(context: string): void {
  const missing = listUnresolvedLegalEntityFields();
  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `[legal-config] ${context}: set real values for ${missing.join(", ")} before staging/production. Placeholders are not allowed.`,
  );
}

export function warnLegalEntityPlaceholdersInDevelopment(): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const missing = listUnresolvedLegalEntityFields();
  if (missing.length === 0) {
    return;
  }

  console.warn(
    `[legal-config] Using placeholders for ${missing.join(", ")}. Replace before commercial launch.`,
  );
}
