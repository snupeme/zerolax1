import type { Language } from '@zerolax/shared';

export interface BotProfile {
  id: string;
  telegramId: string;
  nickname: string;
  language: Language;
  coinsBalance: number;
  status: 'active' | 'blocked';
  iqCompleted: number;
  entranceCompleted: number;
}

export interface BotRegistrationState {
  step: 'language' | 'nickname' | 'phone';
  language: Language | null;
  nickname: string | null;
}

export interface BotUserStatus {
  registered: boolean;
  profile: BotProfile | null;
  state: BotRegistrationState | null;
}

export interface RegisterInput {
  nickname: string;
  language: Language;
  phone: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export class BotApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BotApiError';
  }
}

/** Thin HTTP client for the API's `/api/internal/bot` server-to-server routes. */
export class BotApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 12_000,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-bot-secret': this.token,
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new BotApiError(
        0,
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Network error',
      );
    }

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      const body = payload as { error?: { code?: string; message?: string } } | null;
      throw new BotApiError(
        response.status,
        body?.error?.code ?? 'REQUEST_FAILED',
        body?.error?.message ?? `Request failed with ${response.status}`,
      );
    }

    return payload as T;
  }

  getUser(telegramId: string | number): Promise<BotUserStatus> {
    return this.request<BotUserStatus>(`/api/internal/bot/users/${telegramId}`);
  }

  async isNicknameAvailable(
    telegramId: string | number,
    nickname: string,
  ): Promise<boolean> {
    const data = await this.request<{ available: boolean }>(
      `/api/internal/bot/users/${telegramId}/nickname?nickname=${encodeURIComponent(nickname)}`,
    );
    return data.available;
  }

  setState(
    telegramId: string | number,
    state: { step: 'language' | 'nickname' | 'phone'; language?: Language | null; nickname?: string | null },
  ): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`/api/internal/bot/users/${telegramId}/state`, {
      method: 'PUT',
      body: JSON.stringify(state),
    });
  }

  clearState(telegramId: string | number): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`/api/internal/bot/users/${telegramId}/state`, {
      method: 'DELETE',
    });
  }

  register(
    telegramId: string | number,
    input: RegisterInput,
  ): Promise<{ profile: BotProfile }> {
    return this.request<{ profile: BotProfile }>(
      `/api/internal/bot/users/${telegramId}/register`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }

  setLanguage(
    telegramId: string | number,
    language: Language,
  ): Promise<{ profile: BotProfile }> {
    return this.request<{ profile: BotProfile }>(
      `/api/internal/bot/users/${telegramId}/language`,
      { method: 'PATCH', body: JSON.stringify({ language }) },
    );
  }
}
