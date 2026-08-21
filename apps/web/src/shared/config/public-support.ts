/**
 * Public support contact — single source of truth for UI / legal pages.
 * Not a secret; same address in all environments.
 * Do not put the internal forwarding inbox here.
 */
export const PUBLIC_SUPPORT_EMAIL = "support@example.com";

export function supportMailtoHref(email: string = PUBLIC_SUPPORT_EMAIL): string {
  return `mailto:${email}`;
}
