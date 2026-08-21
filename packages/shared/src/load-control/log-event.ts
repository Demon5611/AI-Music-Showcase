import { LOAD_CONTROL_LOG_SCOPE } from "./constants.js";

export type LoadControlEvent =
  | "queue_metrics"
  | "queue_enqueue"
  | "queue_enqueue_skip"
  | "queue_backpressure"
  | "queue_reconcile_enqueue"
  | "queue_reconcile_failed"
  | "queue_reconcile_skip"
  | "queue_reconcile_tick_failed"
  | "startup_reconcile_skipped"
  | "worker_db_ping_retry"
  | "worker_db_ping_non_retryable"
  | "worker_db_unavailable"
  | "provider_job_lifecycle"
  | "suno_rate_limit_acquire"
  | "suno_rate_limit_timeout"
  | "suno_submit"
  | "suno_rate_limit_retry"
  | "suno_callback_sync"
  | "music_callback_latency"
  | "provider_poll"
  | "audio_not_ready"
  | "music_track_persist"
  | "music_track_persist_enqueue"
  | "music_track_persist_retry"
  | "music_track_persist_outcome"
  | "music_track_persist_reconcile"
  | "mureka_submit"
  | "mureka_submit_unknown_reconcile"
  | "mureka_queue_reconcile_failed"
  | "mureka_limiter_acquire"
  | "mureka_limiter_timeout"
  | "mureka_vocal_clone_skipped_deleted"
  | "mureka_vocal_clone_sample_loaded"
  | "mureka_vocal_clone_http_started"
  | "mureka_vocal_clone_http_failed"
  | "mureka_vocal_clone_response_invalid"
  | "mureka_vocal_clone_profile_ready"
  | "mureka_vocal_clone_terminal_failed"
  | "mureka_voice_clone_stuck_reconciled"
  | "mureka_worker_config"
  | "storage_config"
  | "storage_probe"
  | "storage_boundary_error"
  | "mureka_provider_job_outcome"
  | "mureka_connectivity_probe"
  | "voice_profile_deletion_requested"
  | "voice_profile_account_deletion_enqueued"
  | "voice_deletion_pending_stale"
  | "provider_deletion_submitted"
  | "provider_deletion_confirmed"
  | "provider_data_deletion_submit_enqueue"
  | "provider_data_deletion_submitted"
  | "provider_data_deletion_submit_failed"
  | "music_provider_resolved"
  | "music_generation_commit_retry"
  | "music_generation_persisted"
  | "music_queue_selected"
  | "mureka_generate_http_started"
  | "mureka_generate_http_accepted"
  | "mureka_choices_anomaly"
  | "mureka_task_id_persisted"
  | "mureka_worker_heartbeat"
  | "mureka_worker_heartbeat_missing";

export type LoadControlLevel = "info" | "warn" | "error";

export type LoadControlFields = Record<string, string | number | boolean | null | undefined>;

/**
 * Structured load-control log (JSON line). Grep: `scope":"load-control"`.
 * Agent playbook: docs/music-generation-queue-load-control.md
 */
export function logLoadControl(
  event: LoadControlEvent,
  fields: LoadControlFields,
  level: LoadControlLevel = "info",
): void {
  const payload = {
    scope: LOAD_CONTROL_LOG_SCOPE,
    event,
    ts: new Date().toISOString(),
    ...fields,
  };

  const line = JSON.stringify(payload);

  if (level === "warn") {
    console.warn(line);
    return;
  }

  if (level === "error") {
    console.error(line);
    return;
  }

  console.info(line);
}
