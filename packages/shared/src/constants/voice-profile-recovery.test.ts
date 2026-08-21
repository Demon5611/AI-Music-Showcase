import assert from "node:assert/strict";
import { isProviderDeletionRequestStatus } from "./mureka-flags.js";
import {
  VOICE_DELETION_ACTIVE_REQUEST_STATUSES,
  isProviderDeletionRequestOpen,
  isProviderDeletionRequestTerminal,
} from "./voice-deletion.js";
import {
  buildVoiceProfileRecoveryMetadata,
  evaluateVoiceProfileRecoveryEligibility,
} from "./voice-profile-recovery.js";

const expected = {
  profileId: "vp-paid",
  userId: "user-1",
  deletionRequestId: "pddr-1",
};

const baseProfile = {
  id: "vp-paid",
  userId: "user-1",
  status: "deleted_locally",
  deletedAt: new Date("2026-08-08T11:34:22.605Z"),
  externalId: "mureka-vocal-real-id",
};

const baseRequest = {
  id: "pddr-1",
  userId: "user-1",
  resourceId: "vp-paid",
  status: "pending",
  submittedAt: null,
  confirmedAt: null,
};

const baseAccount = {
  accountDeletionStatus: "active",
  hasActiveAccountDeletionRequest: false,
};

// A. pending + not submitted + real externalId → recoverable
{
  const decision = evaluateVoiceProfileRecoveryEligibility({
    profile: baseProfile,
    deletionRequest: baseRequest,
    account: baseAccount,
    expected,
  });
  assert.equal(decision.eligible, true);
}

// B. submitted_to_provider → recovery prohibited
{
  const decision = evaluateVoiceProfileRecoveryEligibility({
    profile: baseProfile,
    deletionRequest: {
      ...baseRequest,
      status: "submitted_to_provider",
      submittedAt: new Date(),
    },
    account: baseAccount,
    expected,
  });
  assert.equal(decision.eligible, false);
  if (!decision.eligible) {
    assert.equal(decision.reason, "deletion_request_not_pending");
  }
}

{
  const decision = evaluateVoiceProfileRecoveryEligibility({
    profile: baseProfile,
    deletionRequest: {
      ...baseRequest,
      submittedAt: new Date(),
    },
    account: baseAccount,
    expected,
  });
  assert.equal(decision.eligible, false);
  if (!decision.eligible) {
    assert.equal(decision.reason, "deletion_request_already_submitted");
  }
}

// C. confirmed / provider_deleted → recovery prohibited
{
  const decision = evaluateVoiceProfileRecoveryEligibility({
    profile: { ...baseProfile, status: "provider_deleted" },
    deletionRequest: {
      ...baseRequest,
      status: "confirmed",
      confirmedAt: new Date(),
    },
    account: baseAccount,
    expected,
  });
  assert.equal(decision.eligible, false);
}

assert.equal(isProviderDeletionRequestStatus("cancelled"), true);
assert.equal(isProviderDeletionRequestTerminal("cancelled"), true);
assert.equal(isProviderDeletionRequestOpen("cancelled"), false);
assert.equal(isProviderDeletionRequestOpen("pending"), true);

// D. cancelled request not in ops pending list statuses
assert.ok(
  !(VOICE_DELETION_ACTIVE_REQUEST_STATUSES as readonly string[]).includes(
    "cancelled",
  ),
);

// E. cancelled does not block ready VoiceProfile (open check)
assert.equal(isProviderDeletionRequestOpen("cancelled"), false);

// Recovery metadata contract
{
  const meta = buildVoiceProfileRecoveryMetadata({
    previous: { providerMode: "manual" },
    recoveredProfileId: "vp-paid",
    recoveredAt: new Date("2026-08-08T12:00:00.000Z"),
  });
  assert.equal(meta.recoveryReason, "erroneous_legacy_self_service_voice_deletion");
  assert.equal(meta.recoveredProfileId, "vp-paid");
  assert.equal(meta.recoveredAt, "2026-08-08T12:00:00.000Z");
  assert.equal(meta.providerMode, "manual");
}

console.log("voice-profile-recovery.test.ts: ok");
