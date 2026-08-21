import type { User, VocalGender } from "@ai-music/shared";
import type { ApiClient } from "./client.js";

export interface UpdateUserBody {
  vocalGender: VocalGender;
}

export function createUsersApi(client: ApiClient) {
  return {
    getMe: () => client.get<User>("/api/users/me"),
    updateMe: (body: UpdateUserBody) => client.patch<User>("/api/users/me", body),
  };
}
