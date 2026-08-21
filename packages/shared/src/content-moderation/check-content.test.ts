import { checkContentAllowed } from "./check-content.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertAllowed(text: string, expected: boolean, caseName: string): void {
  const result = checkContentAllowed(text);
  assert(result.allowed === expected, `Провален кейс "${caseName}"`);
}

function runContentModerationChecks(): void {
  assertAllowed("Этот текст про хуй и злость", false, "plain RU mat blocked");
  assertAllowed("This chorus is fucking loud", false, "EN profanity blocked");
  assertAllowed("х . у . й", false, "obfuscation with separators blocked");
  assertAllowed("х@й", false, "obfuscation with leetspeak blocked");
  assertAllowed("xyi", false, "translit hint blocked");
  assertAllowed("хууууууй", false, "repeated chars blocked");
  assertAllowed("Убила меня тоска, и ночь тянется бесконечно", true, "clean creative text allowed");
  assertAllowed("", true, "empty text allowed");
  assertAllowed("   ", true, "whitespace text allowed");
}

runContentModerationChecks();
