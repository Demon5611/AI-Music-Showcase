"use client";

import type { ReactNode } from "react";
import { legal } from "@/features/legal/legal-classes";
import { SupportEmailLink } from "@/shared/ui/support-email-link";

/** next-intl rich-text tag renderer for `<email></email>` in legal copy. */
export function legalSupportEmailTag(_chunks: ReactNode) {
  return <SupportEmailLink className={legal.link} />;
}
