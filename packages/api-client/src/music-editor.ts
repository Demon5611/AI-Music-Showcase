import type {
  ApplyOperationBody,
  EditorStateDto,
  ExportWavBody,
  ExportWavResponseDto,
  InitEditorResponse,
  RenderSongResponse,
} from "@ai-music/shared";
import type { ApiClient } from "./client.js";

export function createMusicEditorApi(client: ApiClient) {
  return {
    initEditor: (trackId: string) =>
      client.post<InitEditorResponse>(`/api/music/tracks/${trackId}/editor`, {}),
    getSong: (songId: string) => client.get<EditorStateDto>(`/api/music/${songId}`),
    getEditorState: (songId: string) =>
      client.get<EditorStateDto>(`/api/music/${songId}/editor-state`),
    separateStems: (songId: string) =>
      client.post<EditorStateDto>(`/api/music/${songId}/separate-stems`, {}),
    retryStemSeparation: (songId: string) =>
      client.post<EditorStateDto>(`/api/music/${songId}/separate-stems/retry`, {}),
    applyOperation: (songId: string, body: ApplyOperationBody) =>
      client.post<EditorStateDto>(`/api/music/${songId}/operations`, body),
    undoLastOperation: (songId: string) =>
      client.post<EditorStateDto>(`/api/music/${songId}/operations/undo`, {}),
    redoLastOperation: (songId: string) =>
      client.post<EditorStateDto>(`/api/music/${songId}/operations/redo`, {}),
    previewOperation: (songId: string, body: ApplyOperationBody) =>
      client.post<{ valid: boolean; operation: ApplyOperationBody["operation"] }>(
        `/api/music/${songId}/preview-operation`,
        body,
      ),
    render: (songId: string) => client.post<RenderSongResponse>(`/api/music/${songId}/render`, {}),
    exportWav: (songId: string, body: ExportWavBody = {}) =>
      client.post<ExportWavResponseDto>(`/api/music/${songId}/export-wav`, body),
    getRenderJob: (songId: string, jobId: string) =>
      client.get<{
        id: string;
        status: string;
        errorMessage: string | null;
      }>(`/api/music/${songId}/render/${jobId}`),
  };
}
