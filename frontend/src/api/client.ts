import { ApiError } from './types'
import type { ApiErrorDetails, PageMeta } from './types'

const TOKEN_KEY = 'outinggo.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Ignore storage failures so auth can still work in memory.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore storage failures.
  }
}

interface ErrorEnvelope {
  error?: {
    code?: string
    message?: string
    details?: ApiErrorDetails[]
  }
}

interface ApiFetchOptions {
  method?: string
  body?: unknown
}

interface ApiEnvelope<T> extends ErrorEnvelope {
  data?: T
  meta?: PageMeta
}

async function requestJson<T>(path: string, options: ApiFetchOptions): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server')
  }

  const json = (await response.json()) as ApiEnvelope<T>
  if (!response.ok) {
    throw new ApiError(
      response.status,
      json.error?.code ?? 'UNKNOWN_ERROR',
      json.error?.message ?? 'Request failed',
      json.error?.details,
    )
  }
  return json
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const json = await requestJson<T>(path, options)
  return json.data as T
}

export async function apiFetchPage<T>(path: string): Promise<{ data: T; meta: PageMeta }> {
  const json = await requestJson<T>(path, {})
  return { data: json.data as T, meta: json.meta as PageMeta }
}
