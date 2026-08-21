import type { Track } from "@ai-music/shared";
import type { ApiClient } from "./client.js";

export function createTracksApi(client: ApiClient) {
  return {
    list: () => client.get<Track[]>("/api/tracks"),
    get: (id: string) => client.get<Track>(`/api/tracks/${id}`),
    getByShareSlug: (slug: string) =>
      client.get<Track>(`/api/share/${slug}`),
    remove: (id: string) => client.delete<void>(`/api/tracks/${id}`),
  };
}
