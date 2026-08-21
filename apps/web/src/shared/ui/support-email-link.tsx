"use client";

import {
  PUBLIC_SUPPORT_EMAIL,
  supportMailtoHref,
} from "@/shared/config/public-support";

type SupportEmailLinkProps = {
  className?: string;
  /** Accessible name; defaults to the email address. */
  "aria-label"?: string;
};

export function SupportEmailLink({
  className,
  "aria-label": ariaLabel,
}: SupportEmailLinkProps) {
  return (
    <a
      aria-label={ariaLabel ?? PUBLIC_SUPPORT_EMAIL}
      className={className}
      href={supportMailtoHref()}
    >
      {PUBLIC_SUPPORT_EMAIL}
    </a>
  );
}
