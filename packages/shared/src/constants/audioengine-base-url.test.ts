import assert from "node:assert/strict";
import {
  describeAudioengineBaseUrl,
  AUDIOENGINE_DEFAULT_BASE_URL,
  parseAudioengineBaseUrl,
} from "./audioengine-base-url.js";

assert.equal(parseAudioengineBaseUrl("integration.example.invalid").ok, false);
assert.equal(parseAudioengineBaseUrl("integration.example.invalid").reason, "invalid_url");

assert.equal(parseAudioengineBaseUrl("https//integration.example.invalid").ok, false);
assert.equal(parseAudioengineBaseUrl("https//integration.example.invalid").reason, "invalid_url");

assert.equal(parseAudioengineBaseUrl("http://integration.example.invalid").ok, false);
assert.equal(parseAudioengineBaseUrl("http://integration.example.invalid").reason, "protocol_not_https");
assert.equal(parseAudioengineBaseUrl("http://integration.example.invalid").protocol, "http:");

const accepted = parseAudioengineBaseUrl("https://integration.example.invalid");
assert.equal(accepted.ok, true);
if (accepted.ok) {
  assert.equal(accepted.baseUrl, "https://integration.example.invalid");
  assert.equal(accepted.protocol, "https:");
  assert.equal(accepted.hostname, "integration.example.invalid");
}

const withSlash = parseAudioengineBaseUrl("https://integration.example.invalid/");
assert.equal(withSlash.ok, true);
if (withSlash.ok) {
  assert.equal(withSlash.baseUrl, "https://integration.example.invalid");
}

const unset = parseAudioengineBaseUrl(undefined);
assert.equal(unset.ok, true);
if (unset.ok) {
  assert.equal(unset.baseUrl, AUDIOENGINE_DEFAULT_BASE_URL);
}

const describedInvalid = describeAudioengineBaseUrl("integration.example.invalid");
assert.equal(describedInvalid.baseUrlConfigured, true);
assert.equal(describedInvalid.baseUrlValid, false);
assert.equal(describedInvalid.protocol, null);

const describedValid = describeAudioengineBaseUrl("https://integration.example.invalid");
assert.equal(describedValid.baseUrlConfigured, true);
assert.equal(describedValid.baseUrlValid, true);
assert.equal(describedValid.hostname, "integration.example.invalid");
assert.equal(describedValid.protocol, "https:");

const describedUnset = describeAudioengineBaseUrl("");
assert.equal(describedUnset.baseUrlConfigured, false);
assert.equal(describedUnset.baseUrlValid, true);

console.log("audioengine-base-url unit tests passed");
