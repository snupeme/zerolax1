import type {
  AdminTelegramIdentity,
  AdminAuditLog,
  AdminEntranceTest,
  AdminIqTest,
  AdminNotificationRow,
  AdminOverview,
  AdminTestQuestion,
  AdminUserRow,
  CoinTransaction,
  DeliveryLog,
  EntranceHistoryItem,
  EntranceResultResponse,
  EntranceSessionResponse,
  EntranceTestSummary,
  Gift,
  InboxNotification,
  IqHistoryItem,
  IqResultResponse,
  IqTestSummary,
  IqTodayResponse,
  Language,
  Profile,
  ProfileStats,
  QuestionPublic,
  SupportRequest,
} from '@zerolax/shared';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const SESSION_STORAGE_KEY = 'zerolax.session.v1';
export const ADMIN_STORAGE_KEY = 'zerolax.admin.v1';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  profile: Profile;
}

export interface AdminSession {
  accessToken: string;
  expiresIn: number;
  admin: { id: string; email: string; name: string; role: string };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function publicStoredProfile(profile: Profile): Profile {
  const {id,nickname,language,avatarUrl,coinsBalance,status,notificationPrefs,registeredAt}=profile;
  return {id,nickname,language,phone:null,avatarUrl,coinsBalance,status,notificationPrefs,registeredAt};
}
export function hasLegacyTelegramClaim(token: string): boolean {
  try { return Object.hasOwn(JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))),'tg'); } catch { return false; }
}
export function getStoredSession(): AuthSession | null {
  const stored = readJson<AuthSession>(SESSION_STORAGE_KEY);
  if (!stored?.profile) return null;
  const clean = { ...stored, profile: publicStoredProfile(stored.profile) };
  if (JSON.stringify(clean.profile) !== JSON.stringify(stored.profile)) {
    try { writeJson(SESSION_STORAGE_KEY, clean); } catch { /* Storage may be read-only. */ }
  }
  return clean;
}

export function setStoredSession(session: AuthSession): void {
  writeJson(SESSION_STORAGE_KEY, { ...session, profile: publicStoredProfile(session.profile) });
}

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getStoredAdminSession(): AdminSession | null {
  return readJson<AdminSession>(ADMIN_STORAGE_KEY);
}

export function setStoredAdminSession(session: AdminSession): void {
  writeJson(ADMIN_STORAGE_KEY, session);
}

export function clearStoredAdminSession(): void {
  localStorage.removeItem(ADMIN_STORAGE_KEY);
}

type Listener = () => void;
const sessionExpiredListeners = new Set<Listener>();
const adminExpiredListeners = new Set<Listener>();

/** Registers a callback fired when the refresh token can no longer refresh the session. */
export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

/** Registers a callback fired when the admin access token is rejected. */
export function onAdminSessionExpired(listener: Listener): () => void {
  adminExpiredListeners.add(listener);
  return () => adminExpiredListeners.delete(listener);
}

function emitSessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}

function emitAdminSessionExpired(): void {
  for (const listener of adminExpiredListeners) listener();
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: 'user' | 'admin' | 'none';
  retry?: boolean;
  signal?: AbortSignal;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function toApiError(response: Response, payload: unknown): ApiError {
  const body = payload as { error?: { code?: string; message?: string; details?: unknown } } | null;
  return new ApiError(
    response.status,
    body?.error?.code ?? 'REQUEST_FAILED',
    body?.error?.message ?? `Request failed with status ${response.status}`,
    body?.error?.details,
  );
}

let refreshPromise: Promise<AuthSession | null> | null = null;

/** Rotates the refresh token. Concurrent callers share one request. */
export function refreshUserSession(): Promise<AuthSession | null> {
  if (refreshPromise) return refreshPromise;
  const current = getStoredSession();
  if (!current?.refreshToken) return Promise.resolve(null);

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        clearStoredSession();
        emitSessionExpired();
        return null;
      }
      const session = payload as AuthSession;
      setStoredSession(session);
      return session;
    } catch {
      // Network failure: keep the stored session so a later retry can succeed.
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth ?? 'user';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  if (auth === 'user') {
    const session = getStoredSession();
    if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
  } else if (auth === 'admin') {
    const session = getStoredAdminSession();
    if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Unable to reach the server. Please check your connection.',
    );
  }

  const payload = await parseResponse(response);
  if (!response.ok) throw toApiError(response, payload);
  return payload as T;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth ?? 'user';
  const shouldRetry = options.retry !== false;

  try {
    return await rawRequest<T>(path, options);
  } catch (error) {
    if (
      auth === 'user' &&
      shouldRetry &&
      error instanceof ApiError &&
      error.status === 401 &&
      !path.startsWith('/api/auth/refresh')
    ) {
      const session = await refreshUserSession();
      if (session) {
        return rawRequest<T>(path, { ...options, retry: false });
      }
      throw error;
    }
    if (auth === 'admin' && error instanceof ApiError && error.status === 401) {
      clearStoredAdminSession();
      emitAdminSessionExpired();
    }
    throw error;
  }
}

function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// ---------------------------------------------------------------------------
// Config & auth
// ---------------------------------------------------------------------------

export interface PublicConfig {
  name: string;
  version: string;
  timezone: string;
  languages: Language[];
  botUsername: string;
  devAuthEnabled: boolean;
}

export const api = {
  config: () => request<PublicConfig>('/api', { auth: 'none' }),

  auth: {
    telegram: (initData: string) =>
      request<AuthSession>('/api/auth/telegram', {
        method: 'POST',
        body: { initData },
        auth: 'none',
      }),
    dev: (input: { nickname?: string; language?: Language; telegramId?: string } = {}) =>
      request<AuthSession>('/api/auth/dev', {
        method: 'POST',
        body: input,
        auth: 'none',
      }),
    refresh: refreshUserSession,
    logout: (refreshToken?: string) =>
      request<{ ok: true }>('/api/auth/logout', {
        method: 'POST',
        body: { refreshToken },
        auth: 'none',
      }),
  },

  user: {
    me: () =>
      request<{
        profile: Profile;
        stats: ProfileStats;
        unreadNotifications: number;
        recentIq: IqHistoryItem[];
        recentEntrance: EntranceHistoryItem[];
      }>('/api/user/me'),
    updateMe: (input: {
      nickname?: string;
      language?: Language;
      notificationPrefs?: Profile['notificationPrefs'];
    }) => request<{ profile: Profile }>('/api/user/me', { method: 'PATCH', body: input }),
    coins: () => request<{ transactions: CoinTransaction[] }>('/api/user/me/coins'),
    history: () =>
      request<{ iq: IqHistoryItem[]; entrance: EntranceHistoryItem[] }>('/api/user/me/history'),
    notifications: () =>
      request<{ notifications: InboxNotification[]; unread: number }>('/api/user/notifications'),
    markRead: (id: string) =>
      request<{ ok: true }>(`/api/user/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () =>
      request<{ ok: true }>('/api/user/notifications/read-all', { method: 'POST' }),
    gifts: () => request<{ gifts: Gift[] }>('/api/user/gifts'),
    supportRequests: () => request<{ requests: SupportRequest[] }>('/api/user/support'),
    createSupportRequest: (input: { subject: string; message: string }) =>
      request<{ request: SupportRequest }>('/api/user/support', { method: 'POST', body: input }),
  },

  iq: {
    today: () => request<IqTodayResponse>('/api/iq/today'),
    start: (testId: string) =>
      request<{
        test: IqTestSummary;
        attempt: {
          id: string;
          testId: string;
          status: 'in_progress' | 'submitted' | 'scored';
          startedAt: string;
          submittedAt: string | null;
          answers: Record<string, string>;
        };
        questions: QuestionPublic[];
        serverTime: string;
      }>(`/api/iq/${testId}/attempt`, { method: 'POST' }),
    answer: (attemptId: string, questionId: string, optionId: string) =>
      request<{ saved: boolean; answeredCount: number }>(`/api/iq/attempts/${attemptId}/answer`, {
        method: 'PUT',
        body: { questionId, optionId },
      }),
    submit: (attemptId: string) =>
      request<{ submitted: true; submittedAt: string; releaseAt: string | null }>(
        `/api/iq/attempts/${attemptId}/submit`,
        { method: 'POST' },
      ),
    result: (testId: string) => request<IqResultResponse>(`/api/iq/${testId}/result`),
    history: () => request<{ history: IqHistoryItem[] }>('/api/iq/history'),
  },

  entrance: {
    tests: () =>
      request<{
        tests: EntranceTestSummary[];
        todayAttempt: {
          attemptId: string;
          testId: string;
          status: 'in_progress' | 'submitted' | 'expired';
          remainingSeconds: number;
        } | null;
        serverTime: string;
      }>('/api/entrance/tests'),
    start: (testId: string) =>
      request<EntranceSessionResponse>(`/api/entrance/tests/${testId}/start`, { method: 'POST' }),
    session: (testId: string) =>
      request<EntranceSessionResponse>(`/api/entrance/tests/${testId}/session`),
    answer: (attemptId: string, questionId: string, optionId: string) =>
      request<{ saved: boolean; answeredCount: number }>(
        `/api/entrance/attempts/${attemptId}/answer`,
        { method: 'PUT', body: { questionId, optionId } },
      ),
    submit: (attemptId: string) =>
      request<{ status: 'submitted' | 'expired'; result: EntranceResultResponse }>(
        `/api/entrance/attempts/${attemptId}/submit`,
        { method: 'POST' },
      ),
    result: (attemptId: string) =>
      request<EntranceResultResponse>(`/api/entrance/attempts/${attemptId}/result`),
    history: () => request<{ history: EntranceHistoryItem[] }>('/api/entrance/history'),
  },

  admin: {
    login: (email: string, password: string) =>
      request<AdminSession>('/api/admin/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: 'none',
      }),
    overview: () => request<AdminOverview>('/api/admin/overview', { auth: 'admin' }),
    users: (params: { search?: string; page?: number; limit?: number } = {}) =>
      request<{ users: AdminUserRow[]; total: number; page: number; limit: number }>(
        `/api/admin/users${queryString(params)}`,
        { auth: 'admin' },
      ),
    user: (id: string) =>
      request<{
        profile: Profile;
        phone: string | null;
        stats: ProfileStats;
        coinTransactions: CoinTransaction[];
        iqHistory: IqHistoryItem[];
        entranceHistory: EntranceHistoryItem[];
      }>(`/api/admin/users/${id}`, { auth: 'admin' }),
    userTelegram: (id: string) => request<AdminTelegramIdentity>(`/api/admin/users/${id}/telegram`,{auth:'admin'}),
    setUserStatus: (id: string, status: 'active' | 'blocked') =>
      request<{ ok: true; status: 'active' | 'blocked' }>(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: { status },
        auth: 'admin',
      }),
    adjustCoins: (id: string, amount: number, reason: string) =>
      request<{ balance: number }>(`/api/admin/users/${id}/coins`, {
        method: 'POST',
        body: { amount, reason },
        auth: 'admin',
      }),

    iqTests: () => request<{ tests: AdminIqTest[] }>('/api/admin/iq/tests', { auth: 'admin' }),
    iqTest: (id: string) =>
      request<{ test: AdminIqTest; questions: AdminTestQuestion[] }>(`/api/admin/iq/tests/${id}`, {
        auth: 'admin',
      }),
    createIqTest: (input: {
      testDate: string;
      titleUz: string;
      titleRu: string;
      titleEn: string;
    }) =>
      request<{ test: AdminIqTest }>('/api/admin/iq/tests', {
        method: 'POST',
        body: input,
        auth: 'admin',
      }),
    updateIqTest: (
      id: string,
      input: Partial<{ testDate: string; titleUz: string; titleRu: string; titleEn: string }>,
    ) =>
      request<{ test: AdminIqTest }>(`/api/admin/iq/tests/${id}`, {
        method: 'PATCH',
        body: input,
        auth: 'admin',
      }),
    deleteIqTest: (id: string) =>
      request<{ ok: true }>(`/api/admin/iq/tests/${id}`, { method: 'DELETE', auth: 'admin' }),
    publishIqTest: (id: string) =>
      request<{ test: AdminIqTest }>(`/api/admin/iq/tests/${id}/publish`, {
        method: 'POST',
        auth: 'admin',
      }),
    addIqQuestion: (testId: string, input: QuestionInput) =>
      request<{ question: AdminTestQuestion }>(`/api/admin/iq/tests/${testId}/questions`, {
        method: 'POST',
        body: input,
        auth: 'admin',
      }),
    updateIqQuestion: (questionId: string, input: QuestionInput) =>
      request<{ question: AdminTestQuestion }>(`/api/admin/iq/questions/${questionId}`, {
        method: 'PATCH',
        body: input,
        auth: 'admin',
      }),
    deleteIqQuestion: (questionId: string) =>
      request<{ ok: true }>(`/api/admin/iq/questions/${questionId}`, {
        method: 'DELETE',
        auth: 'admin',
      }),

    entranceTests: () =>
      request<{ tests: AdminEntranceTest[] }>('/api/admin/entrance/tests', { auth: 'admin' }),
    entranceTest: (id: string) =>
      request<{ test: AdminEntranceTest; questions: AdminTestQuestion[] }>(
        `/api/admin/entrance/tests/${id}`,
        { auth: 'admin' },
      ),
    createEntranceTest: (input: EntranceTestInput) =>
      request<{ test: AdminEntranceTest }>('/api/admin/entrance/tests', {
        method: 'POST',
        body: input,
        auth: 'admin',
      }),
    updateEntranceTest: (id: string, input: Partial<EntranceTestInput>) =>
      request<{ test: AdminEntranceTest }>(`/api/admin/entrance/tests/${id}`, {
        method: 'PATCH',
        body: input,
        auth: 'admin',
      }),
    deleteEntranceTest: (id: string) =>
      request<{ ok: true }>(`/api/admin/entrance/tests/${id}`, {
        method: 'DELETE',
        auth: 'admin',
      }),
    publishEntranceTest: (id: string) =>
      request<{ test: AdminEntranceTest }>(`/api/admin/entrance/tests/${id}/publish`, {
        method: 'POST',
        auth: 'admin',
      }),
    unpublishEntranceTest: (id: string) =>
      request<{ test: AdminEntranceTest }>(`/api/admin/entrance/tests/${id}/unpublish`, {
        method: 'POST',
        auth: 'admin',
      }),
    addEntranceQuestion: (testId: string, input: QuestionInput) =>
      request<{ question: AdminTestQuestion }>(`/api/admin/entrance/tests/${testId}/questions`, {
        method: 'POST',
        body: input,
        auth: 'admin',
      }),
    updateEntranceQuestion: (questionId: string, input: QuestionInput) =>
      request<{ question: AdminTestQuestion }>(`/api/admin/entrance/questions/${questionId}`, {
        method: 'PATCH',
        body: input,
        auth: 'admin',
      }),
    deleteEntranceQuestion: (questionId: string) =>
      request<{ ok: true }>(`/api/admin/entrance/questions/${questionId}`, {
        method: 'DELETE',
        auth: 'admin',
      }),

    notifications: () =>
      request<{ notifications: AdminNotificationRow[] }>('/api/admin/notifications', {
        auth: 'admin',
      }),
    createNotification: (input: NotificationInput) =>
      request<{ id: string; delivery: { sent: number; failed: number } | null }>(
        '/api/admin/notifications',
        { method: 'POST', body: input, auth: 'admin' },
      ),
    logs: () => request<{ logs: DeliveryLog[] }>('/api/admin/logs', { auth: 'admin' }),
    audit: () => request<{ logs: AdminAuditLog[] }>('/api/admin/audit', { auth: 'admin' }),
  },
};

export interface QuestionInput {
  textUz: string;
  textRu: string;
  textEn: string;
  explanationUz?: string | null;
  explanationRu?: string | null;
  explanationEn?: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  coins: number;
  imageUrl?: string | null;
  correctOptionIndex: number;
  options: Array<{ textUz: string; textRu: string; textEn: string }>;
}

export interface EntranceTestInput {
  slug: string;
  titleUz: string;
  titleRu: string;
  titleEn: string;
  descriptionUz?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
  durationSeconds: number;
}

export interface NotificationInput {
  titleUz: string;
  titleRu: string;
  titleEn: string;
  bodyUz: string;
  bodyRu: string;
  bodyEn: string;
  target: 'all' | 'active' | 'user';
  targetUserId?: string | null;
  scheduledAt?: string | null;
}
