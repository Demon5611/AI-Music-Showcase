export interface KitsErrorBody {
  error?: string;
  code?: string;
}

const FREE_TIER_FORBIDDEN_CODE = "E_FORBIDDEN_EXCEPTION";

export class KitsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "KitsApiError";
  }

  get userMessage(): string {
    if (this.isFreeTierForbidden()) {
      return "Нужен платный план Kits для API";
    }

    if (this.status === 401) {
      return "Неверный Kits API key";
    }

    if (this.status === 403) {
      return "Доступ к ресурсу Kits запрещён. Проверьте ID модели и аккаунт API key.";
    }

    if (this.status === 429) {
      return "Превышен лимит запросов Kits API";
    }

    return this.message;
  }

  isFreeTierForbidden(): boolean {
    return (
      this.code === FREE_TIER_FORBIDDEN_CODE ||
      this.message.toLowerCase().includes("free tier")
    );
  }
}

export async function throwKitsApiError(
  response: Response,
  action: string,
): Promise<never> {
  const rawBody = await response.text();
  let parsed: KitsErrorBody = {};

  try {
    parsed = JSON.parse(rawBody) as KitsErrorBody;
  } catch {
    parsed = { error: rawBody };
  }

  const message = parsed.error ?? rawBody ?? `${action} failed`;
  const status = resolveKitsErrorStatus(response.status, parsed.code, message);

  throw new KitsApiError(message, status, parsed.code);
}

function resolveKitsErrorStatus(
  responseStatus: number,
  code: string | undefined,
  message: string,
): number {
  if (code === FREE_TIER_FORBIDDEN_CODE || message.toLowerCase().includes("free tier")) {
    return 403;
  }

  if (responseStatus >= 400 && responseStatus < 600) {
    return responseStatus;
  }

  return 502;
}
