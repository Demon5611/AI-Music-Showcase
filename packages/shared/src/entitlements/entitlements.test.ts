import {
  checkFeature,
  checkProjectLimit,
  checkVersionHistoryOperationLimit,
  resolveEntitlements,
} from "./index.js";
import { UNLIMITED_PROJECTS_CAP, resolveMaxProjects } from "../constants/plans.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runEntitlementsChecks(): void {
  assert(resolveMaxProjects("free") === UNLIMITED_PROJECTS_CAP, "free maxProjects = safety cap");
  assert(resolveMaxProjects("pro") === UNLIMITED_PROJECTS_CAP, "pro maxProjects = safety cap");
  assert(resolveMaxProjects("studio") === UNLIMITED_PROJECTS_CAP, "studio maxProjects = safety cap");

  assert(
    resolveEntitlements("pro").maxProjects === UNLIMITED_PROJECTS_CAP,
    "resolved pro maxProjects",
  );
  assert(resolveEntitlements("free").features.wavExport === true, "free wavExport on");
  assert(resolveEntitlements("pro").features.wavExport === true, "pro wavExport on");
  assert(resolveEntitlements("free").features.voicePresets === true, "free voicePresets on");
  assert(resolveEntitlements("free").features.aiRemix === true, "free aiRemix on");
  assert(resolveEntitlements("free").features.editor === "advanced", "free advanced editor");
  assert(resolveEntitlements("free").features.musicGeneration === "full", "free full generation");
  assert(resolveEntitlements("free").features.stemSeparation === true, "free stems on");
  assert(resolveEntitlements("free").features.priorityQueue === false, "no pack queue privilege");
  assert(resolveEntitlements("studio").features.priorityQueue === false, "studio same queue");
  assert(resolveEntitlements("free").queuePriority === 10, "uniform queue priority");
  assert(resolveEntitlements("studio").queuePriority === 10, "uniform queue priority studio");

  const freeRemix = checkFeature("free", "aiRemix");
  assert(freeRemix.ok, "free aiRemix allowed");

  const freeStem = checkFeature("free", "stemSeparation");
  assert(freeStem.ok, "free stemSeparation allowed");

  const freeUnderCap = checkProjectLimit("free", UNLIMITED_PROJECTS_CAP - 1);
  assert(freeUnderCap.ok, "free under safety project cap");

  const freeAtCap = checkProjectLimit("free", UNLIMITED_PROJECTS_CAP);
  assert(!freeAtCap.ok && freeAtCap.code === "PROJECT_LIMIT_EXCEEDED", "free at safety cap");
  assert(!freeAtCap.ok && freeAtCap.limit === UNLIMITED_PROJECTS_CAP, "safety cap limit value");

  const studioUnderCap = checkProjectLimit("studio", 500);
  assert(studioUnderCap.ok, "studio under safety cap");

  const studioAtCap = checkProjectLimit("studio", UNLIMITED_PROJECTS_CAP);
  assert(!studioAtCap.ok, "studio at safety cap");

  const freeUndo = checkVersionHistoryOperationLimit("free", 500);
  assert(freeUndo.ok, "free extended undo ops");

  const studioUnlimitedOps = checkVersionHistoryOperationLimit("studio", 500);
  assert(studioUnlimitedOps.ok, "studio unlimited undo ops");
}

runEntitlementsChecks();
