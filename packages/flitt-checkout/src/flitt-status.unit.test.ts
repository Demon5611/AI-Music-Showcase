import assert from "node:assert/strict";
import { mapFlittOrderStatus, mapFlittReverseStatus } from "./flitt-status.js";

assert.deepEqual(mapFlittOrderStatus("approved"), {
  domainStatus: "paid",
  normalizedStatus: "succeeded",
  mayGrantCredits: true,
  known: true,
});
assert.equal(mapFlittOrderStatus("created").mayGrantCredits, false);
assert.equal(mapFlittOrderStatus("processing").mayGrantCredits, false);
assert.equal(mapFlittOrderStatus("declined").mayGrantCredits, false);
assert.equal(mapFlittOrderStatus("expired").mayGrantCredits, false);
assert.equal(mapFlittOrderStatus("reversed").mayGrantCredits, false);
assert.equal(mapFlittOrderStatus("weird").known, false);
assert.equal(mapFlittOrderStatus("weird").mayGrantCredits, false);
assert.equal(mapFlittReverseStatus("approved"), "approved");
assert.equal(mapFlittReverseStatus("declined"), "declined");
assert.equal(mapFlittReverseStatus("pending"), "unknown");

console.log("flitt-status.unit.test.ts: ok");
