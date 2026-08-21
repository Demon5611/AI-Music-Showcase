"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { pf } from "@/features/profile/profile-classes";
import {
  buildApiErrorTranslations,
  parseApiError,
} from "@/shared/lib/parse-api-error";
import { useApi } from "@/shared/providers/api-provider";

/**
 * Account deletion Danger Zone — Profile only.
 * Personal AI Voice disable stays on Music Create ("My voice") and never deletes.
 */
export function ProfileAccountDeletionPanel({
  accountDeletionStatus,
}: {
  accountDeletionStatus: string;
}) {
  const api = useApi();
  const locale = useLocale();
  const t = useTranslations("Profile.accountDeletion");
  const tErrors = useTranslations("Errors");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(accountDeletionStatus);
  const [error, setError] = useState<string | null>(null);
  const parseOptions = useMemo(
    () => ({
      includeUnauthorized: true,
      includeServerHint: true,
      translations: buildApiErrorTranslations(tErrors),
    }),
    [tErrors],
  );

  const pending = status !== "active";

  async function handleConfirmDelete() {
    setIsSubmitting(true);
    setError(null);

    try {
      const next = await api.account.requestDeletion({
        // Account-deletion emails currently support en|ru only.
        locale: locale === "ru" ? "ru" : "en",
      });
      setStatus(next.status);
      setConfirmOpen(false);
    } catch (deleteError) {
      setError(parseApiError(deleteError, tErrors("generic"), parseOptions));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (pending) {
    return (
      <section className={pf.dangerSection} aria-live="polite">
        <h2 className={pf.dangerTitle}>{t("title")}</h2>
        <p className={pf.dangerStatus}>{t("pending")}</p>
        <p className={pf.voiceHint}>{t("pendingHint")}</p>
      </section>
    );
  }

  return (
    <section className={pf.dangerSection}>
      <h2 className={pf.dangerTitle}>{t("title")}</h2>
      <p className={pf.voiceHint}>{t("description")}</p>

      {error ? (
        <p className={pf.voiceError} role="alert">
          {error}
        </p>
      ) : null}

      {confirmOpen ? (
        <div
          className={pf.voiceConfirm}
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-delete-title"
        >
          <h3 id="account-delete-title" className={pf.voiceConfirmTitle}>
            {t("confirmTitle")}
          </h3>
          <p className={pf.voiceHint}>{t("confirmLead")}</p>
          <p className={pf.voiceHint}>{t("confirmBody")}</p>
          <p className={pf.voiceHint}>{t("confirmTiming")}</p>
          <div className={pf.voiceConfirmActions}>
            <button
              className={pf.voiceCancelButton}
              disabled={isSubmitting}
              type="button"
              onClick={() => setConfirmOpen(false)}
            >
              {t("cancel")}
            </button>
            <button
              className={pf.voiceDeleteButton}
              disabled={isSubmitting}
              type="button"
              onClick={() => void handleConfirmDelete()}
            >
              {isSubmitting ? t("deleting") : t("confirmDelete")}
            </button>
          </div>
        </div>
      ) : (
        <button
          className={pf.voiceDeleteButton}
          type="button"
          onClick={() => setConfirmOpen(true)}
        >
          {t("delete")}
        </button>
      )}
    </section>
  );
}
