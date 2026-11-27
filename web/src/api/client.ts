import type { ApiError } from './types'

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  /** O JSON da resposta de erro, ou null se não havia JSON (ou se a rede falhou). */
  readonly body: unknown

  constructor(status: number, code: string, message: string, body: unknown = null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.body = body
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

function isDomainError(body: unknown): body is ApiError {
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    'message' in body &&
    typeof body.code === 'string' &&
    typeof body.message === 'string'
  )
}

function hasValidationDetail(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'detail' in body && Array.isArray(body.detail)
}

async function toRequestError(response: Response): Promise<ApiRequestError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Corpo vazio ou que não é JSON (um 500 de proxy, por exemplo): cai em unknown_error.
  }

  if (isDomainError(body)) {
    return new ApiRequestError(response.status, body.code, body.message, body)
  }
  if (hasValidationDetail(body)) {
    return new ApiRequestError(
      response.status,
      'validation_error',
      'Confira os dados informados.',
      body,
    )
  }
  return new ApiRequestError(
    response.status,
    'unknown_error',
    'Algo deu errado. Tente de novo.',
    body,
  )
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    throw new ApiRequestError(
      0,
      'network_error',
      'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
    )
  }

  if (!response.ok) {
    throw await toRequestError(response)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}
