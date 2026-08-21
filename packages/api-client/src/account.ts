import type { ApiClient } from "./client.js";

export type AccountDeletionState = {
  status: string;
  requestedAt: string | null;
  finalizedAt: string | null;
  emailSentAt: string | null;
};

export function createAccountApi(client: ApiClient) {
  return {
    getDeletion: () => client.get<AccountDeletionState>("/api/account/deletion"),
    requestDeletion: (body?: { locale?: "en" | "ru" }) =>
      client.post<AccountDeletionState>("/api/account/deletion", body ?? {}),
  };
}
