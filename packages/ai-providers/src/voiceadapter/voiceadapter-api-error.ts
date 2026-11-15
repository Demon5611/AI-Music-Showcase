export interface VoiceadapterErrorBody {
  error?: string;
  code?: string;
}

const FREE_TIER_FORBIDDEN_CODE = "E_FORBIDDEN_EXCEPTION";

export class VoiceadapterApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "VoiceadapterApiError";
  }

  get userMessage(): string {
    if (this.isFreeTierForbidden()) {
      return "Нужен платный план Voiceadapter для API";
    }

    if (this.status === 401) {
      return "Неверный Voiceadapter API key";
    }

    if (this.status === 403) {
      return "Доступ к ресурсу Voiceadapter запрещён. Проверьте ID модели и аккаунт API key.";
    }

    if (this.status === 429) {
      return "Превышен лимит запросов Voiceadapter API";
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

export async function throwVoiceadapterApiError(
  response: Response,
  action: string,
): Promise<never> {
  const rawBody = await response.text();
  let parsed: VoiceadapterErrorBody = {};

  try {
    parsed = JSON.parse(rawBody) as VoiceadapterErrorBody;
  } catch {
    parsed = { error: rawBody };
  }

  const message = parsed.error ?? rawBody ?? `${action} failed`;
  const status = resolveVoiceadapterErrorStatus(response.status, parsed.code, message);

  throw new VoiceadapterApiError(message, status, parsed.code);
}

function resolveVoiceadapterErrorStatus(
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
