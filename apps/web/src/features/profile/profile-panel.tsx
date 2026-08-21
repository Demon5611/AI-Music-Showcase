"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { pf } from "@/features/profile/profile-classes";
import { ProfileAccountDeletionPanel } from "@/features/profile/profile-account-deletion-panel";
import { useSubscriptionQuery } from "@/features/billing/hooks/use-subscription-query";
import { useApi } from "@/shared/providers/api-provider";
import { env } from "@/shared/config/env";
import { buildApiErrorTranslations, parseApiError } from "@/shared/lib/parse-api-error";
import { RequireAuth } from "@/shared/ui/require-auth";

export function ProfilePanel() {
  const t = useTranslations("Profile");

  return (
    <RequireAuth hint={t("authHint")} title={t("authTitle")}>
      <ProfilePanelContent />
    </RequireAuth>
  );
}

function ProfilePanelContent() {
  const api = useApi();
  const t = useTranslations("Profile");
  const tCommon = useTranslations("Common");
  const tErrors = useTranslations("Errors");
  const format = useFormatter();

  const userQuery = useQuery({
    queryKey: ["users", "me"],
    queryFn: () => api.users.getMe(),
  });

  const creditsQuery = useQuery({
    queryKey: ["credits", "balance"],
    queryFn: () => api.credits.getBalance(),
  });

  const subscriptionQuery = useSubscriptionQuery();

  const isLoading = userQuery.isLoading || creditsQuery.isLoading || subscriptionQuery.isLoading;
  const error = userQuery.error ?? creditsQuery.error ?? subscriptionQuery.error;

  if (isLoading) {
    return <p className={pf.status}>{t("loading")}</p>;
  }

  if (error) {
    return (
      <div className={pf.errorBox}>
        <p className={pf.error}>
          {parseApiError(error, tErrors("profileLoadFailed"), {
            translations: buildApiErrorTranslations(tErrors),
          })}
        </p>
        {!env.isClerkEnabled ? <p className={pf.hint}>{tErrors("profileDevHint")}</p> : null}
      </div>
    );
  }

  const user = userQuery.data;
  const balance = subscriptionQuery.data?.creditsBalance ?? creditsQuery.data?.balance ?? 0;
  const balanceLabel = format.number(balance, {
    maximumFractionDigits: 3,
  });

  if (!user) {
    return null;
  }

  return (
    <section className={pf.section}>
      <h1 className={pf.title}>{t("title")}</h1>

      <dl className={pf.details}>
        <div className={pf.row}>
          <dt className={pf.label}>{t("labels.email")}</dt>
          <dd className={pf.value}>{user.email}</dd>
        </div>
        <div className={pf.row}>
          <dt className={pf.label}>{t("labels.name")}</dt>
          <dd className={pf.value}>{user.name ?? tCommon("emptyValue")}</dd>
        </div>
        <div className={pf.rowWide}>
          <dt className={pf.labelWide}>{t("labels.creditBalance")}</dt>
          <dd className={pf.value}>{balanceLabel}</dd>
        </div>
        {!env.isClerkEnabled ? (
          <div className={pf.row}>
            <dt className={pf.label}>{t("labels.devUser")}</dt>
            <dd className={pf.value}>{user.id}</dd>
          </div>
        ) : null}
      </dl>

      <p className={pf.billingNote}>{t("billingNote")}</p>

      <ProfileAccountDeletionPanel
        accountDeletionStatus={user.accountDeletionStatus ?? "active"}
      />

      <div className={pf.actions}>
        <Link className={pf.primaryLink} href="/music-create">
          {t("actions.createTrack")}
        </Link>
        <Link className={pf.secondaryLink} href="/pricing">
          {t("actions.buyCredits")}
        </Link>
      </div>

      <p className={pf.historyNote}>{t("historyNote")}</p>
    </section>
  );
}
