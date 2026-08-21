/**
 * Guardrails for public legal copy (Flitt + refund semantics + registry identity).
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/features/legal/legal-content.ui.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const enRaw = readFileSync(join(here, "../../../messages/legal/en.json"), "utf8");
const ruRaw = readFileSync(join(here, "../../../messages/legal/ru.json"), "utf8");
const enLegal = JSON.parse(enRaw) as Record<string, unknown>;
const ruLegal = JSON.parse(ruRaw) as Record<string, unknown>;
const routing = readFileSync(join(here, "../../i18n/routing.ts"), "utf8");
const legalConfig = readFileSync(join(here, "../../shared/config/legal.ts"), "utf8");
const refundPanel = readFileSync(join(here, "refund-policy-panel.tsx"), "utf8");
const entityDetails = readFileSync(join(here, "legal-entity-details.tsx"), "utf8");

assert.match(routing, /locales = \["en", "ru", "ka"\]/);

function termsPayment(locale: Record<string, unknown>): string {
  const terms = locale.terms as { payment: { p1: string } };
  return terms.payment.p1;
}

function privacyPayment(locale: Record<string, unknown>): string {
  const privacy = locale.privacy as {
    dataWeCollect: { paymentP1: string; paymentP2: string; paymentP3: string };
  };
  return [
    privacy.dataWeCollect.paymentP1,
    privacy.dataWeCollect.paymentP2,
    privacy.dataWeCollect.paymentP3,
  ].join("\n");
}

function refundBlob(locale: Record<string, unknown>): string {
  return JSON.stringify(locale.refund);
}

for (const legal of [enLegal, ruLegal]) {
  assert.match(termsPayment(legal), /Flitt/);
  assert.doesNotMatch(termsPayment(legal), /TBC Bank/);
  assert.match(privacyPayment(legal), /Flitt/);
  assert.doesNotMatch(privacyPayment(legal), /TBC Bank/);

  const refund = refundBlob(legal);
  assert.doesNotMatch(refund, /generally not eligible/);
  assert.doesNotMatch(refund, /как правило, не подлежат/);
  assert.doesNotMatch(refund, /none of the paid credits/);
  assert.doesNotMatch(refund, /платные кредиты из этой покупки не использовались/);
  assert.doesNotMatch(refund, /credits may remain reserved/i);
  assert.doesNotMatch(refund, /оставаться зарезервированными/);
  assert.doesNotMatch(refund, /does not currently allocate/);
  assert.doesNotMatch(refund, /не распределяет списанные кредиты/);
  assert.match(refund, /unused paid credits|неиспользованн/);
  assert.match(refund, /original payment|исходн/);
  assert.match(refund, /operationRefund/);
  assert.match(refund, /not applied cumulatively|не применяются совместно/);
  assert.match(refund, /Flitt/);
  assert.doesNotMatch(refund, /TBC Bank/);
}

assert.doesNotMatch(enRaw, /TBC Bank/);
assert.doesNotMatch(ruRaw, /TBC Bank/);
assert.doesNotMatch(enRaw, /planned payment processor/);
assert.doesNotMatch(ruRaw, /планируется TBC/);
assert.doesNotMatch(enRaw, /partially used packages are generally not eligible/i);
assert.doesNotMatch(enRaw, /credits may remain reserved/i);

assert.match(legalConfig, /000000000/);
assert.match(legalConfig, /Demo Individual Entrepreneur/);
assert.match(legalConfig, /Demo Country, Demo City, Demo Street 1/);
assert.match(legalConfig, /Demo Public Registry/);
assert.match(legalConfig, /01\/01\/2026/);
assert.match(legalConfig, /terms: "2026-08-20"/);
assert.match(legalConfig, /privacy: "2026-08-20"/);
assert.match(legalConfig, /refund: "2026-08-20"/);
assert.doesNotMatch(legalConfig, /\[LEGAL ENTITY NAME\]/);
assert.doesNotMatch(legalConfig, /\[IDENTIFICATION NUMBER\]/);
assert.doesNotMatch(legalConfig, /\[BUSINESS ADDRESS\]/);
assert.doesNotMatch(legalConfig, /Dmitrii Sedov|347013732|Kobuleti/);

assert.match(entityDetails, /LEGAL_ENTITY\.registrationDate/);
assert.match(entityDetails, /LEGAL_ENTITY\.registeringAuthority/);
assert.match(entityDetails, /LEGAL_ENTITY\.serviceName/);
assert.doesNotMatch(entityDetails, /phone|Phone|PHONE/);
assert.doesNotMatch(entityDetails, /\[LEGAL ENTITY NAME\]/);
assert.doesNotMatch(entityDetails, /\[IDENTIFICATION NUMBER\]/);
assert.doesNotMatch(entityDetails, /\[BUSINESS ADDRESS\]/);

assert.match(refundPanel, /purchaseRemainder/);
assert.match(refundPanel, /operationRefund/);
assert.match(refundPanel, /remediesXor/);
assert.doesNotMatch(refundPanel, /unused\.title|partial\.title/);

console.log("legal-content.ui.test.ts: ok");
