import { apiFetch } from '../api/client'
import type { TokenResponse, User } from '../api/types'
import { tokenStore } from './tokenStore'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function postJson(body: unknown): RequestInit {
  return { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) }
}

export function register(email: string, password: string, name: string): Promise<User> {
  return apiFetch<User>('/api/auth/register', postJson({ email, password, name }))
}

export async function login(email: string, password: string): Promise<string> {
  const data = await apiFetch<TokenResponse>('/api/auth/login', postJson({ email, password }))
  tokenStore.set(data.access_token)
  return data.access_token
}

// Voo único: enquanto uma renovação está em andamento, todo mundo recebe a mesma Promise.
// Duas requisições com o mesmo cookie fariam o backend ver o reuso e revogar a família.
let inflight: Promise<string> | null = null

export function refresh(): Promise<string> {
  if (inflight) {
    return inflight
  }
  inflight = apiFetch<TokenResponse>('/api/auth/refresh', { method: 'POST' })
    .then((data) => {
      tokenStore.set(data.access_token)
      return data.access_token
    })
    .catch((error: unknown) => {
      tokenStore.clear()
      throw error
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<void>('/api/auth/logout', { method: 'POST' })
  } finally {
    tokenStore.clear()
  }
}
