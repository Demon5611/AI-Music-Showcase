/**
 * BullMQ rejects custom job ids that contain `:`.
 * Join stable parts with `-` and fail fast if a part is unsafe.
 */
export function createBullMqJobId(...parts: Array<string | number>): string {
  if (parts.length === 0) {
    throw new Error("BullMQ jobId requires at least one part");
  }

  const normalized = parts.map((part, index) => {
    const value = String(part).trim();
    if (!value) {
      throw new Error(`BullMQ jobId part ${index} is empty`);
    }
    if (value.includes(":")) {
      throw new Error(`BullMQ jobId part must not contain ":" (part ${index})`);
    }
    return value;
  });

  const jobId = normalized.join("-");
  if (jobId.includes(":")) {
    throw new Error("BullMQ jobId must not contain \":\"");
  }
  return jobId;
}
