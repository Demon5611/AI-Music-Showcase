export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getAuthToken?: () => Promise<string | null> | string | null;
}

function isFormDataBody(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export function createApiClient(options: ApiClientOptions) {
  const { baseUrl, getAuthToken } = options;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getAuthToken ? await getAuthToken() : null;
    const headers = new Headers(init.headers);

    if (init.body && !isFormDataBody(init.body) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }

      throw new ApiError(`API request failed: ${response.status}`, response.status, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown, headers?: HeadersInit) =>
      request<T>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
        headers,
      }),
    postForm: <T>(path: string, body: FormData) => request<T>(path, { method: "POST", body }),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: "PATCH",
        body: body ? JSON.stringify(body) : undefined,
      }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
