import assert from "node:assert/strict";
import {
  buildAccountDeletionEmailIdempotencyKey,
  isAccountActiveForProductUse,
  isAccountDeletionBlockingStatus,
} from "@ai-music/shared";
import { AccountDeletionPendingError } from "../../common/errors.js";
import {
  FailingAccountEmailNotifier,
  NoopAccountEmailNotifier,
  SuccessfulAccountEmailNotifier,
  isEmailSendSuccess,
  resetAccountEmailNotifierForTests,
  setAccountEmailNotifier,
  type AccountEmailNotifier,
} from "./account-email-notifier.js";
import {
  canAttemptInternalFinalization,
  clerkInboundDeletedAction,
  nextEmailPersistence,
  planFinalizePhases,
  shouldAttemptClerkIdentityCleanup,
} from "./account-deletion.rules.js";
import {
  buildClerkCleanupMetadata,
  deleteClerkIdentity,
  readClerkCleanupCompleted,
} from "./clerk-identity-cleanup.js";

// ---------------------------------------------------------------------------
// Shared helpers / status contracts
// ---------------------------------------------------------------------------

assert.equal(isAccountActiveForProductUse("active"), true);
assert.equal(isAccountActiveForProductUse("deletion_requested"), false);
assert.equal(isAccountDeletionBlockingStatus("provider_deletion_pending"), true);

assert.equal(
  buildAccountDeletionEmailIdempotencyKey("user-1"),
  "account_deletion:user-1:completion_email",
);

{
  const err = new AccountDeletionPendingError();
  assert.equal(err.code, "ACCOUNT_DELETION_PENDING");
  assert.equal(err.statusCode, 403);
}

// ---------------------------------------------------------------------------
// In-memory lifecycle harness (ordering + side-effect counts)
// ---------------------------------------------------------------------------

type HarnessState = {
  accountDeletionStatus: string;
  finalizedAt: Date | null;
  notificationEmail: string | null;
  emailSentAt: Date | null;
  clerkCleanupCompleted: boolean;
  userEmail: string;
  openProviderDeletionCount: number;
  internalFinalizeCount: number;
  clerkDeleteCalls: number;
  metadata: Record<string, unknown>;
};

function createHarness(overrides?: Partial<HarnessState>): HarnessState {
  return {
    accountDeletionStatus: "ready_for_finalization",
    finalizedAt: null,
    notificationEmail: "user@example.com",
    emailSentAt: null,
    clerkCleanupCompleted: false,
    userEmail: "user@example.com",
    openProviderDeletionCount: 0,
    internalFinalizeCount: 0,
    clerkDeleteCalls: 0,
    metadata: { locale: "ru" },
    ...overrides,
  };
}

async function runFinalize(
  state: HarnessState,
  options?: {
    clerkDelete?: (userId: string) => Promise<void>;
    emailNotifier?: AccountEmailNotifier;
  },
): Promise<{ finalized: boolean }> {
  const phases = planFinalizePhases({
    accountDeletionStatus: state.accountDeletionStatus,
    finalizedAt: state.finalizedAt,
    openProviderDeletionCount: state.openProviderDeletionCount,
    clerkCleanupCompleted: state.clerkCleanupCompleted,
    emailSentAt: state.emailSentAt,
  });

  if (phases.includes("blocked_provider_pending")) {
    return { finalized: false };
  }

  if (
    phases.includes("internal_finalize") &&
    canAttemptInternalFinalization({
      accountDeletionStatus: state.accountDeletionStatus,
      openProviderDeletionCount: state.openProviderDeletionCount,
    })
  ) {
    state.internalFinalizeCount += 1;
    state.accountDeletionStatus = "deleted";
    state.finalizedAt = new Date();
    state.userEmail = `deleted+user-1@invalid.local`;
  }

  if (
    shouldAttemptClerkIdentityCleanup({
      accountDeletionStatus: state.accountDeletionStatus,
      finalizedAt: state.finalizedAt,
      clerkCleanupCompleted: state.clerkCleanupCompleted,
    })
  ) {
    const deleteUser =
      options?.clerkDelete ??
      (async () => {
        /* default ok */
      });

    const wrapped: typeof deleteUser = async (userId) => {
      state.clerkDeleteCalls += 1;
      await deleteUser(userId);
    };

    const outcome = await deleteClerkIdentity("user-1", { deleteUser: wrapped });
    state.metadata = buildClerkCleanupMetadata(state.metadata, outcome, new Date());
    if (outcome.status === "completed") {
      state.clerkCleanupCompleted = true;
    }
  }

  if (!state.emailSentAt && state.notificationEmail) {
    const notifier =
      options?.emailNotifier ?? new NoopAccountEmailNotifier();
    const result = await notifier.sendAccountDeletionComplete({
      to: state.notificationEmail,
      locale: "ru",
      idempotencyKey: buildAccountDeletionEmailIdempotencyKey("user-1"),
    });
    const patch = nextEmailPersistence({
      result,
      notificationEmail: state.notificationEmail,
      emailSentAt: state.emailSentAt,
    });
    state.emailSentAt = patch.emailSentAt;
    state.notificationEmail = patch.notificationEmail;
    state.metadata = {
      ...state.metadata,
      emailDelivery: patch.emailDelivery,
    };
  }

  return { finalized: state.accountDeletionStatus === "deleted" && Boolean(state.finalizedAt) };
}

// A. provider pending → Clerk delete NOT called
{
  const state = createHarness({
    accountDeletionStatus: "provider_deletion_pending",
    openProviderDeletionCount: 1,
  });
  const result = await runFinalize(state);
  assert.equal(result.finalized, false);
  assert.equal(state.clerkDeleteCalls, 0);
  assert.equal(state.internalFinalizeCount, 0);
  assert.equal(
    shouldAttemptClerkIdentityCleanup({
      accountDeletionStatus: state.accountDeletionStatus,
      finalizedAt: state.finalizedAt,
      clerkCleanupCompleted: false,
    }),
    false,
  );
}

// B. provider confirmed → internal finalize once → Clerk delete once
{
  let clerkDeletes = 0;
  const state = createHarness({
    accountDeletionStatus: "ready_for_finalization",
    openProviderDeletionCount: 0,
  });
  const result = await runFinalize(state, {
    clerkDelete: async () => {
      clerkDeletes += 1;
    },
    emailNotifier: new SuccessfulAccountEmailNotifier(),
  });
  assert.equal(result.finalized, true);
  assert.equal(state.internalFinalizeCount, 1);
  assert.equal(state.clerkDeleteCalls, 1);
  assert.equal(clerkDeletes, 1);
  assert.equal(state.clerkCleanupCompleted, true);
  assert.ok(state.finalizedAt);
  assert.equal(state.userEmail, "deleted+user-1@invalid.local");
}

// C. repeated finalize → no duplicate Clerk delete side effects
{
  let clerkDeletes = 0;
  const state = createHarness({
    accountDeletionStatus: "ready_for_finalization",
    openProviderDeletionCount: 0,
  });
  const clerkDelete = async () => {
    clerkDeletes += 1;
  };
  await runFinalize(state, {
    clerkDelete,
    emailNotifier: new SuccessfulAccountEmailNotifier(),
  });
  await runFinalize(state, {
    clerkDelete,
    emailNotifier: new SuccessfulAccountEmailNotifier(),
  });
  assert.equal(state.internalFinalizeCount, 1);
  assert.equal(clerkDeletes, 1);
  assert.equal(state.clerkDeleteCalls, 1);
}

// D. Clerk already missing → cleanup succeeds idempotently
{
  const outcome = await deleteClerkIdentity("user-1", {
    deleteUser: async () => {
      const err = Object.assign(new Error("Not Found"), { status: 404 });
      throw err;
    },
  });
  assert.equal(outcome.status, "completed");
  if (outcome.status === "completed") {
    assert.equal(outcome.reason, "already_missing");
  }

  const meta = buildClerkCleanupMetadata({}, outcome, new Date());
  assert.equal(readClerkCleanupCompleted(meta), true);
}

// E. Clerk webhook after outbound delete → no new deletion request
{
  const action = clerkInboundDeletedAction({
    accountDeletionStatus: "deleted",
    finalizedAt: new Date(),
  });
  assert.equal(action, "noop_already_finalized");

  const whilePending = clerkInboundDeletedAction({
    accountDeletionStatus: "provider_deletion_pending",
    finalizedAt: null,
  });
  assert.equal(whilePending, "start_or_continue_deletion");
}

// F. Noop notifier → emailSentAt null → notificationEmail retained
{
  resetAccountEmailNotifierForTests();
  const notifier = new NoopAccountEmailNotifier();
  setAccountEmailNotifier(notifier);

  const send = await notifier.sendAccountDeletionComplete({
    to: "user@example.com",
    locale: "ru",
    idempotencyKey: buildAccountDeletionEmailIdempotencyKey("noop-user"),
  });
  assert.equal(send.status, "deferred");
  assert.equal(isEmailSendSuccess(send), false);

  const patch = nextEmailPersistence({
    result: send,
    notificationEmail: "user@example.com",
    emailSentAt: null,
  });
  assert.equal(patch.emailSentAt, null);
  assert.equal(patch.notificationEmail, "user@example.com");
  assert.equal(patch.emailDelivery, "deferred");

  const state = createHarness();
  await runFinalize(state, { emailNotifier: notifier });
  assert.equal(state.emailSentAt, null);
  assert.equal(state.notificationEmail, "user@example.com");
  resetAccountEmailNotifierForTests();
}

// G. Real/mock successful notifier → emailSentAt set → notificationEmail cleared
{
  const notifier = new SuccessfulAccountEmailNotifier();
  const send = await notifier.sendAccountDeletionComplete({
    to: "user@example.com",
    locale: "ru",
    idempotencyKey: buildAccountDeletionEmailIdempotencyKey("ok-user"),
  });
  assert.equal(send.status, "sent");
  assert.equal(isEmailSendSuccess(send), true);

  const patch = nextEmailPersistence({
    result: send,
    notificationEmail: "user@example.com",
    emailSentAt: null,
    now: new Date("2026-08-08T12:00:00.000Z"),
  });
  assert.ok(patch.emailSentAt);
  assert.equal(patch.notificationEmail, null);

  const state = createHarness();
  await runFinalize(state, { emailNotifier: notifier });
  assert.ok(state.emailSentAt);
  assert.equal(state.notificationEmail, null);
}

// H. Email failure → account stays deleted → notification retry remains possible
{
  const notifier = new FailingAccountEmailNotifier();
  const state = createHarness();
  const result = await runFinalize(state, { emailNotifier: notifier });
  assert.equal(result.finalized, true);
  assert.equal(state.accountDeletionStatus, "deleted");
  assert.ok(state.finalizedAt);
  assert.equal(state.emailSentAt, null);
  assert.equal(state.notificationEmail, "user@example.com");

  // Retry with success later
  await runFinalize(state, { emailNotifier: new SuccessfulAccountEmailNotifier() });
  assert.ok(state.emailSentAt);
  assert.equal(state.notificationEmail, null);
  // Clerk still only once
  assert.equal(state.clerkDeleteCalls, 1);
}

// Ordering: provider pending never schedules clerk/email finalize phases
{
  const phases = planFinalizePhases({
    accountDeletionStatus: "provider_deletion_pending",
    finalizedAt: null,
    openProviderDeletionCount: 2,
    clerkCleanupCompleted: false,
    emailSentAt: null,
  });
  assert.deepEqual(phases, ["blocked_provider_pending"]);
}

{
  const phases = planFinalizePhases({
    accountDeletionStatus: "ready_for_finalization",
    finalizedAt: null,
    openProviderDeletionCount: 0,
    clerkCleanupCompleted: false,
    emailSentAt: null,
  });
  assert.deepEqual(phases, [
    "internal_finalize",
    "clerk_cleanup",
    "email_notification",
  ]);
}

console.log("account-deletion.contract.test.ts: ok");
