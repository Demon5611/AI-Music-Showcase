/**
 * Locale routing + message key parity for en/ru/ka.
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/i18n/locale-parity.ui.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(join(webRoot, rel), "utf8"));
}

function leafKeys(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leafKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

const routing = readFileSync(join(here, "routing.ts"), "utf8");
const globalTypes = readFileSync(join(here, "global.ts"), "utf8");
const layout = readFileSync(join(webRoot, "src/app/[locale]/layout.tsx"), "utf8");
const switcher = readFileSync(join(webRoot, "src/shared/ui/language-switcher.tsx"), "utf8");
const paymentReturn = readFileSync(
  join(webRoot, "../../packages/shared/src/utils/payment-return.ts"),
  "utf8",
);
const en = loadJson("messages/en.json") as Record<string, unknown>;
const ru = loadJson("messages/ru.json") as Record<string, unknown>;
const ka = loadJson("messages/ka.json") as Record<string, unknown>;
const legalEn = loadJson("messages/legal/en.json") as Record<string, unknown>;
const legalRu = loadJson("messages/legal/ru.json") as Record<string, unknown>;
const legalKa = loadJson("messages/legal/ka.json") as Record<string, unknown>;

assert.match(routing, /locales = \["en", "ru", "ka"\]/);
assert.match(routing, /defaultLocale: Locale = "en"/);
assert.match(globalTypes, /"en" \| "ru" \| "ka"/);
assert.match(layout, /lang=\{locale\}/);
assert.match(layout, /Noto_Sans_Georgian/);
assert.match(switcher, /router\.replace\(href, \{ locale: nextLocale \}\)/);
assert.match(paymentReturn, /PAYMENT_RETURN_LOCALES = \["en", "ru", "ka"\]/);

const enKeys = leafKeys(en).sort();
const ruKeys = leafKeys(ru).sort();
const kaKeys = leafKeys(ka).sort();
assert.deepEqual(ruKeys, enKeys);
assert.deepEqual(kaKeys, enKeys);

const legalEnKeys = leafKeys(legalEn).sort();
assert.deepEqual(leafKeys(legalRu).sort(), legalEnKeys);
assert.deepEqual(leafKeys(legalKa).sort(), legalEnKeys);

const languageSwitcher = (en.LanguageSwitcher ?? {}) as Record<string, string>;
assert.equal(languageSwitcher.ka, "ქართული");
assert.equal((ka.LanguageSwitcher as Record<string, string>).ka, "ქართული");

const pricingEn = (en.Pricing as { packages: Record<string, string> }).packages;
const pricingKa = (ka.Pricing as { packages: Record<string, string> }).packages;
assert.match(pricingEn.gelPaymentNote, /GEL/);
assert.match(pricingKa.gelPaymentNote, /GEL/);
assert.match(pricingKa.gelPaymentNote, /საქართველოს ეროვნული ბანკის/);

const termsKa = JSON.stringify((legalKa as { terms: unknown }).terms);
const privacyKa = JSON.stringify((legalKa as { privacy: unknown }).privacy);
const refundKa = JSON.stringify((legalKa as { refund: unknown }).refund);
assert.match(termsKa, /Flitt/);
assert.doesNotMatch(termsKa, /TBC Bank/);
assert.match(privacyKa, /Flitt/);
assert.doesNotMatch(privacyKa, /TBC Bank/);
assert.match(refundKa, /Flitt/);
assert.doesNotMatch(refundKa, /TBC Bank/);
assert.doesNotMatch(refundKa, /remain reserved|დარჩება დაჯავშნ/i);
assert.match(refundKa, /ორიგინალ/);
assert.match(refundKa, /გამოუყენებელ ფასიან კრედიტ|ნაწილობრივ გამოყენებული/);
assert.match(refundKa, /ერთად არ გამოიყენება/);

assert.doesNotMatch(JSON.stringify(legalKa), /\[LEGAL ENTITY NAME\]|\[IDENTIFICATION NUMBER\]|\[BUSINESS ADDRESS\]/);
assert.doesNotMatch(JSON.stringify(legalKa), /"phone"|ტელეფონი/);

const entityDetails = readFileSync(
  join(webRoot, "src/features/legal/legal-entity-details.tsx"),
  "utf8",
);
assert.doesNotMatch(entityDetails, /phone|Phone|PHONE|ტელეფონი/);

const legalConfig = readFileSync(join(webRoot, "src/shared/config/legal.ts"), "utf8");
assert.match(legalConfig, /000000000/);
assert.match(legalConfig, /Demo Individual Entrepreneur/);
assert.doesNotMatch(legalConfig, /347013732|Dmitrii Sedov|Kobuleti/);

console.log("locale-parity.ui.test.ts: ok", {
  baseKeys: enKeys.length,
  legalKeys: legalEnKeys.length,
});
