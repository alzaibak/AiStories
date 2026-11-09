const API_BASE_URL = import.meta.env.DEV
  ? '/api/v1'
  : import.meta.env.VITE_API_URL ||
    `${window.location.protocol}//${window.location.hostname}:5000/api/v1`;
const REQUEST_TIMEOUT_MS = 15000;
const DUPLICATE_EMAIL_MESSAGE =
  'Cette adresse e-mail est déjà associée à un compte. Connectez-vous si vous avez déjà un compte, ou utilisez une autre adresse.';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'READER' | 'EDITOR' | 'REVIEWER';
export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export interface PlatformUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  emailVerifiedAt: string | null;
  language: 'fr' | 'en' | 'ar';
  subscriptions?: ReaderSubscription[];
}

export interface ReaderSubscription {
  id: number;
  planId: number;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused' | 'expired';
  startedAt: string | null;
  expiresAt: string | null;
  gracePeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  accessActive: boolean;
  canManageRenewal?: boolean;
  plan?: {
    id: number;
    name: string;
    slug: string;
    price: number | string;
    currency: string;
    interval: string;
  };
}

const AUTH_TOKEN_KEY = 'storiesToken';
const LEGACY_AUTH_TOKEN_KEY = 'tenderingToken';

export function getAuthToken() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) return token;
  const legacyToken = localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
  if (!legacyToken) return null;
  localStorage.setItem(AUTH_TOKEN_KEY, legacyToken);
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  return legacyToken;
}

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
}

export async function request<T>(path: string, init: RequestInit = {}, bearerToken?: string): Promise<T> {
  const token = bearerToken || getAuthToken();
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers = new Headers(init.headers);
  if (!isFormData && init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abortFromCaller();
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const method = (init.method || 'GET').toUpperCase();
  const language = window.location.pathname.match(/^\/(ar|en|fr)(?:\/|$)/)?.[1] || 'ar';
  const localizedPath = method === 'GET' && ['ar', 'en', 'fr'].includes(language) && !/[?&]lang=/.test(path)
    ? `${path}${path.includes('?') ? '&' : '?'}lang=${language}`
    : path;

  try {
    const response = await fetch(`${API_BASE_URL}${localizedPath}`, {
      ...init,
      headers,
      signal: controller.signal
    });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (
        response.status === 409 &&
        typeof body.message === 'string' &&
        /e-?mail/i.test(body.message) &&
        /(déjà|already|exists)/i.test(body.message)
      ) {
        throw new ApiError(DUPLICATE_EMAIL_MESSAGE, body.code);
      }
      throw new ApiError(body.message || `Erreur API (${response.status}).`, body.code);
    }
    return body as T;
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new Error('La demande prend plus de temps que prévu. Vérifiez votre connexion et réessayez dans un instant.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  postWithBearer: <T>(path: string, body: unknown, bearerToken: string) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${bearerToken}` }
    }, bearerToken),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' })
};
