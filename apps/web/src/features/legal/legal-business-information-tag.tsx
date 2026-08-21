"use client";

import type { ReactNode } from "react";
import { legal } from "@/features/legal/legal-classes";
import { Link } from "@/i18n/navigation";

/** next-intl rich-text tag for `<legalInfo>…</legalInfo>` links. */
export function legalBusinessInformationTag(chunks: ReactNode) {
  return (
    <Link className={legal.link} href="/legal/business-information">
      {chunks}
    </Link>
  );
}
