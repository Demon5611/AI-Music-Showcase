export {
  buildMurekaVocalDeletionEmailBody,
  buildMurekaVocalDeletionEmailSubject,
  sanitizeProviderDeletionEmailError,
  type MurekaVocalDeletionEmailInput,
} from "./mureka-vocal-deletion-message.js";
export {
  ResendSendError,
  resolveTransactionalEmailFromEnv,
  sendEmailViaResend,
  type ResendSendAttachment,
  type ResendSendInput,
  type ResendSendResult,
} from "./resend-send.js";
export {
  downloadResendAttachmentBytes,
  getReceivedEmailViaResend,
  isAllowedResendAttachmentDownloadUrl,
  listReceivedAttachmentsViaResend,
  type ResendReceivedAttachmentDownload,
  type ResendReceivedAttachmentMeta,
  type ResendReceivedEmail,
} from "./resend-receiving.js";
export {
  INBOUND_ATTACHMENT_MAX_BYTES,
  INBOUND_ATTACHMENT_MAX_COUNT,
  INBOUND_ATTACHMENT_MAX_TOTAL_BYTES,
  INBOUND_STAGING_SUBJECT_PREFIX,
  addressesIncludeTarget,
  buildInboundEnvironmentHeader,
  buildInboundForwardBodies,
  buildInboundForwardIdempotencyKey,
  buildInboundForwardSubject,
  buildInboundWebhookEventId,
  extractEmailAddress,
  hasVisibleInboundRecipients,
  isAllowedInboundRecipient,
  normalizeEmailAddress,
  normalizeInboundForwardSubject,
  selectInboundAttachmentsForForward,
  shouldIgnoreInboundForLoop,
  type InboundAttachmentNote,
} from "./inbound-forward.js";
export {
  RESEND_INBOUND_ADDRESS_PRODUCTION,
  RESEND_INBOUND_ADDRESS_STAGING,
  RESEND_INBOUND_DEPLOYED_ADDRESSES,
  ResendInboundEnvError,
  assertResendInboundAddressForAppEnv,
  defaultResendInboundFromIdentity,
  expectedResendInboundAddressForAppEnv,
  resolveResendInboundFromEnv,
  type ResendInboundAppEnv,
  type ResendInboundEnv,
} from "./resolve-inbound-env.js";
export {
  forwardReceivedEmailViaResend,
  type ForwardReceivedEmailResult,
} from "./forward-received-email.js";
export {
  sendMurekaVocalDeletionEmail,
  type SendMurekaVocalDeletionEmailInput,
  type SendMurekaVocalDeletionEmailResult,
} from "./send-mureka-vocal-deletion-email.js";
