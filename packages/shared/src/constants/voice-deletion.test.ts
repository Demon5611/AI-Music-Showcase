import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProviderDeletionRequestMetadata,
  DEFAULT_MUREKA_VOICE_DELETION_SCOPE,
  hasRealProviderExternalId,
  isProviderDeletionRequestOpen,
  isProviderDeletionRequestTerminal,
  isVoiceProfileBlockedForProviderUse,
  isVoiceProfileInDeletionFlow,
  resolveMurekaVoiceDeletionEnabled,
} from "./voice-deletion.js";

describe("voice-deletion helpers", () => {
  it("detects real provider external ids", () => {
    assert.equal(hasRealProviderExternalId("vocal-123"), true);
    assert.equal(hasRealProviderExternalId("pending:abc"), false);
    assert.equal(hasRealProviderExternalId(""), false);
  });

  it("maps deletion flow statuses", () => {
    assert.equal(isVoiceProfileInDeletionFlow("deletion_requested"), true);
    assert.equal(isVoiceProfileInDeletionFlow("ready"), false);
  });

  it("blocks provider use for deletion and failed profiles", () => {
    assert.equal(
      isVoiceProfileBlockedForProviderUse({
        status: "deletion_requested",
        deletedAt: new Date(),
      }),
      true,
    );
    assert.equal(
      isVoiceProfileBlockedForProviderUse({ status: "ready", deletedAt: null }),
      false,
    );
  });

  it("builds provider deletion metadata with scope", () => {
    const metadata = buildProviderDeletionRequestMetadata({
      deletionScope: DEFAULT_MUREKA_VOICE_DELETION_SCOPE,
      providerMode: "manual",
      requiresOperatorAction: true,
    });
    assert.deepEqual(metadata.deletionScope, DEFAULT_MUREKA_VOICE_DELETION_SCOPE);
    assert.equal(metadata.providerMode, "manual");
  });

  it("treats cancelled as terminal and not open", () => {
    assert.equal(isProviderDeletionRequestTerminal("cancelled"), true);
    assert.equal(isProviderDeletionRequestOpen("cancelled"), false);
    assert.equal(isProviderDeletionRequestOpen("pending"), true);
    assert.equal(isProviderDeletionRequestOpen("submitting"), true);
    assert.equal(isProviderDeletionRequestOpen("submit_failed"), true);
  });

  it("resolves voice deletion feature flag", () => {
    assert.equal(resolveMurekaVoiceDeletionEnabled({ MUREKA_VOICE_DELETION_ENABLED: "true" }), true);
    assert.equal(resolveMurekaVoiceDeletionEnabled({}), false);
  });
});
