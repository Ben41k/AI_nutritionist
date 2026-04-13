const base = import.meta.env.VITE_API_BASE ?? '/api';

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const body = (json ?? { error: { code: 'UNKNOWN', message: res.statusText } }) as ApiErrorBody;
    if (!('error' in body) || typeof body.error?.message !== 'string') {
      throw new ApiError(res.status, {
        error: { code: 'UNKNOWN', message: res.statusText },
      });
    }
    throw new ApiError(res.status, body);
  }
  return json as T;
}
