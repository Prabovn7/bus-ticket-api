import { ApiRequestError, apiFetch } from '../api/client'
import { refresh } from './authApi'
import { tokenStore } from './tokenStore'

function withBearer(init: RequestInit | undefined, token: string | null): RequestInit {
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return { ...init, headers }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401
}

/**
 * Chamada autenticada: envia o access token e, se a API responder 401, renova a sessão
 * (em voo único) e repete a requisição uma única vez. Um segundo 401 é erro de verdade.
 */
export async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiFetch<T>(path, withBearer(init, tokenStore.get()))
  } catch (error) {
    if (!isUnauthorized(error)) {
      throw error
    }
  }

  const token = await refresh()
  return apiFetch<T>(path, withBearer(init, token))
}
