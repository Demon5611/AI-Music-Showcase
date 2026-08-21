/** BullMQ waiting jobs — API returns 503 before enqueue. See docs/music-generation-queue-load-control.md */
export const PROVIDER_QUEUE_BACKPRESSURE_THRESHOLD = 80;

/** Log warn when waiting >= this (monitoring hint for agents/operators). */
export const PROVIDER_QUEUE_ALERT_THRESHOLD = 50;

/** Used for queue ETA in status API (~18 Suno submits / 10s). */
export const SUNO_SUBMIT_RATE_PER_SEC = 1.8;

export const LOAD_CONTROL_LOG_SCOPE = "load-control";
