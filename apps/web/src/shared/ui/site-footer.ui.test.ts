/**
 * Guardrails: public support email + legal identity exposure.
 * Full LEGAL_ENTITY block only on business-information page.
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/shared/ui/site-footer.ui.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_SUPPORT_EMAIL,
  supportMailtoHref,
} from "../config/public-support.js";

const here = dirname(fileURLToPath(import.meta.url));
const footer = readFileSync(join(here, "site-footer.tsx"), "utf8");
const supportLink = readFileSync(join(here, "support-email-link.tsx"), "utf8");
const legalEntity = readFileSync(
  join(here, "../../features/legal/legal-entity-details.tsx"),
  "utf8",
);
const businessPanel = readFileSync(
  join(here, "../../features/legal/business-information-panel.tsx"),
  "utf8",
);
const termsPanel = readFileSync(
  join(here, "../../features/legal/terms-panel.tsx"),
  "utf8",
);
const privacyPanel = readFileSync(
  join(here, "../../features/legal/privacy-policy-panel.tsx"),
  "utf8",
);
const refundPanel = readFileSync(
  join(here, "../../features/legal/refund-policy-panel.tsx"),
  "utf8",
);
const purchaseNotice = readFileSync(
  join(here, "../../features/legal/purchase-legal-notice.tsx"),
  "utf8",
);
const pricingPanel = readFileSync(
  join(here, "../../features/billing/credit-packages-pricing-panel.tsx"),
  "utf8",
);
const publicSupport = readFileSync(join(here, "../config/public-support.ts"), "utf8");
const legalConfig = readFileSync(join(here, "../config/legal.ts"), "utf8");
const enLegal = readFileSync(join(here, "../../../messages/legal/en.json"), "utf8");
const ruLegal = readFileSync(join(here, "../../../messages/legal/ru.json"), "utf8");

assert.equal(PUBLIC_SUPPORT_EMAIL, "support@example.com");
assert.equal(supportMailtoHref(), "mailto:support@example.com");

assert.match(publicSupport, /support@example\.com/);
assert.match(legalConfig, /PUBLIC_SUPPORT_EMAIL/);
assert.equal(legalConfig.includes("NEXT_PUBLIC_SUPPORT_EMAIL"), false);
assert.equal(legalConfig.includes("[SUPPORT EMAIL]"), false);

assert.match(footer, /SupportEmailLink/);
assert.match(footer, /\/legal\/business-information/);
assert.match(footer, /legalInfoLink/);
assert.equal(footer.includes("LegalEntityDetails"), false);
assert.equal(footer.includes("LEGAL_ENTITY"), false);

assert.match(supportLink, /supportMailtoHref/);
assert.match(businessPanel, /LegalEntityDetails/);
assert.equal(termsPanel.includes("LegalEntityDetails"), false);
assert.equal(privacyPanel.includes("LegalEntityDetails"), false);
assert.equal(refundPanel.includes("LegalEntityDetails"), false);

assert.match(purchaseNotice, /\/legal\/business-information/);
assert.match(pricingPanel, /\/legal\/business-information/);

assert.match(legalEntity, /LEGAL_ENTITY\.displayName/);
assert.match(legalEntity, /LEGAL_ENTITY\.identificationNumber/);
assert.match(legalEntity, /LEGAL_ENTITY\.businessAddress/);
assert.match(legalEntity, /LEGAL_ENTITY\.registrationDate/);
assert.match(legalEntity, /LEGAL_ENTITY\.registeringAuthority/);
assert.match(legalEntity, /LEGAL_ENTITY\.serviceName/);
assert.doesNotMatch(legalEntity, /phone|Phone|PHONE/);

assert.equal(footer.includes("ops-demo@example.com"), false);
assert.equal(supportLink.includes("ops-demo@example.com"), false);
assert.equal(enLegal.includes("ops-demo@example.com"), false);
assert.equal(ruLegal.includes("ops-demo@example.com"), false);

assert.match(enLegal, /For refund requests, contact/);
assert.match(ruLegal, /Для запроса возврата свяжитесь с нами/);
assert.match(enLegal, /Trader details/);
assert.match(enLegal, /Legal Information/);

console.log("site-footer.ui.test.ts: ok");
