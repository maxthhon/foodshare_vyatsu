import { useCallback, useEffect, useState } from 'react';
import type { Session } from './types';

const messages: Record<string, string> = {
  UNAUTHORIZED: 'Войдите в аккаунт, чтобы продолжить.',
  INVALID_CREDENTIALS: 'Проверьте почту и пароль.',
  EMAIL_IN_USE: 'Этот адрес уже зарегистрирован.',
  VALIDATION_ERROR: 'Проверьте заполненные поля.',
  NOT_FOUND: 'Данные больше недоступны.',
  FORBIDDEN: 'У вашего аккаунта нет доступа к этому разделу.',
  OFFER_UNAVAILABLE: 'Одно из предложений больше недоступно.',
  INSUFFICIENT_STOCK: 'Не хватает позиций. Проверьте актуальный остаток.',
  PICKUP_WINDOW_UNAVAILABLE: 'Окно самовывоза слишком короткое или уже закончилось.',
  RESERVATION_EXPIRED: 'Время брони истекло. Оформите новый заказ.',
  INVALID_ORDER_STATUS: 'Статус заказа изменился. Обновите страницу.',
  INVALID_PICKUP_CODE: 'Код выдачи не подошёл.',
  IDEMPOTENCY_CONFLICT: 'Данные запроса изменились. Обновите страницу и повторите действие.',
  RATE_LIMITED: 'Слишком много попыток. Подождите минуту.',
  STOCK_ALREADY_COMMITTED: 'Часть остатка уже закреплена за заказами.',
  OFFER_HAS_ORDERS: 'Для предложения с заказами окно самовывоза и тип уже зафиксированы.',
  OFFER_CLOSED: 'Окно самовывоза закончилось.',
  INVALID_OFFER: 'Проверьте цены и размер бокса.',
  INVALID_PICKUP_WINDOW: 'Окно самовывоза должно заканчиваться в будущем.',
  REVIEW_EXISTS: 'Отзыв об этом заказе уже опубликован.',
  INVALID_PERIOD: 'Выберите период от одного до 90 дней.',
};

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(messages[code] ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.');
  }
}

type Access = 'public' | 'optional' | 'required';
type Options = { method?: string; body?: unknown; mode?: Access; key?: string; signal?: AbortSignal };
let session: Session | null = null;
let refreshRequest: Promise<Session | null> | null = null;
let revision = 0;
const listeners = new Set<(value: Session | null) => void>();

export function currentSession() { return session; }
export function subscribeSession(listener: (value: Session | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function send<T>(path: string, options: Options = {}, token?: string): Promise<T> {
  const headers = new Headers();
  if (token) headers.set('Authorization', 'Bearer ' + token);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.key) headers.set('Idempotency-Key', options.key);
  const response = await fetch('/api' + path, {
    method: options.method, credentials: 'same-origin', headers, signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error?.code ?? 'INTERNAL_ERROR');
  if (data === null) throw new ApiError(502, 'INTERNAL_ERROR');
  return data as T;
}

function setSession(value: Session | null) {
  session = value;
  revision++;
  for (const listener of listeners) listener(value);
}

export function refreshSession() {
  if (!refreshRequest) {
    const version = revision;
    refreshRequest = send<Session>('/auth/refresh', { method: 'POST' }).then((value) => {
      if (version === revision) setSession(value);
      return session;
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        if (version === revision) setSession(null);
        return session;
      }
      throw error;
    }).finally(() => { refreshRequest = null; });
  }
  return refreshRequest;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  if (!options.mode || options.mode === 'public') return send<T>(path, options);
  const initial = session;
  if (!initial && options.mode === 'required') throw new ApiError(401, 'UNAUTHORIZED');
  try {
    return await send<T>(path, options, initial?.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401 && initial)) throw error;
    const next = session?.accessToken !== initial.accessToken && session ? session : await refreshSession();
    if (!next && options.mode === 'required') throw error;
    return send<T>(path, options, next?.accessToken);
  }
}

export async function authenticate(action: 'login' | 'register', body: unknown) {
  if (refreshRequest) await refreshRequest.catch(() => null);
  const value = await send<Session>('/auth/' + action, { method: 'POST', body });
  setSession(value);
  return value.user;
}

export async function logout() {
  if (refreshRequest) await refreshRequest.catch(() => null);
  await send('/auth/logout', { method: 'POST' }, session?.accessToken);
  setSession(null);
}

export function message(error: unknown) {
  return error instanceof ApiError ? error.message : 'Не удалось подключиться. Проверьте интернет и попробуйте ещё раз.';
}

export function useResource<T>(path: string | null, mode: Access = 'public', accountId?: string) {
  const [version, update] = useState(0);
  const [state, setState] = useState<{ path: string; accountId?: string; data?: T; error?: string }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { mode, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ path, accountId, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ path, accountId, error: message(error) });
      });
    return () => controller.abort();
  }, [path, mode, accountId, version]);
  const reload = useCallback(() => update((value) => value + 1), []);
  const current = state && state.path === path && state.accountId === accountId ? state : undefined;
  return { ...current, loading: Boolean(path) && !current, reload };
}
