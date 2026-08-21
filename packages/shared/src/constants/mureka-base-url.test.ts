import assert from "node:assert/strict";
import {
  describeMurekaBaseUrl,
  MUREKA_DEFAULT_BASE_URL,
  parseMurekaBaseUrl,
} from "./mureka-base-url.js";

assert.equal(parseMurekaBaseUrl("api.mureka.ai").ok, false);
assert.equal(parseMurekaBaseUrl("api.mureka.ai").reason, "invalid_url");

assert.equal(parseMurekaBaseUrl("https//api.mureka.ai").ok, false);
assert.equal(parseMurekaBaseUrl("https//api.mureka.ai").reason, "invalid_url");

assert.equal(parseMurekaBaseUrl("http://api.mureka.ai").ok, false);
assert.equal(parseMurekaBaseUrl("http://api.mureka.ai").reason, "protocol_not_https");
assert.equal(parseMurekaBaseUrl("http://api.mureka.ai").protocol, "http:");

const accepted = parseMurekaBaseUrl("https://api.mureka.ai");
assert.equal(accepted.ok, true);
if (accepted.ok) {
  assert.equal(accepted.baseUrl, "https://api.mureka.ai");
  assert.equal(accepted.protocol, "https:");
  assert.equal(accepted.hostname, "api.mureka.ai");
}

const withSlash = parseMurekaBaseUrl("https://api.mureka.ai/");
assert.equal(withSlash.ok, true);
if (withSlash.ok) {
  assert.equal(withSlash.baseUrl, "https://api.mureka.ai");
}

const unset = parseMurekaBaseUrl(undefined);
assert.equal(unset.ok, true);
if (unset.ok) {
  assert.equal(unset.baseUrl, MUREKA_DEFAULT_BASE_URL);
}

const describedInvalid = describeMurekaBaseUrl("api.mureka.ai");
assert.equal(describedInvalid.baseUrlConfigured, true);
assert.equal(describedInvalid.baseUrlValid, false);
assert.equal(describedInvalid.protocol, null);

const describedValid = describeMurekaBaseUrl("https://api.mureka.ai");
assert.equal(describedValid.baseUrlConfigured, true);
assert.equal(describedValid.baseUrlValid, true);
assert.equal(describedValid.hostname, "api.mureka.ai");
assert.equal(describedValid.protocol, "https:");

const describedUnset = describeMurekaBaseUrl("");
assert.equal(describedUnset.baseUrlConfigured, false);
assert.equal(describedUnset.baseUrlValid, true);

console.log("mureka-base-url unit tests passed");
