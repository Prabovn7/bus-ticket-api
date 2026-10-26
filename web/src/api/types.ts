export interface City {
  id: number
  name: string
  uf: string
}

export interface TripResult {
  trip_id: number
  departure_at: string // ISO 8601, em UTC
  arrival_at: string
  price_cents: number
  capacity: number
}

/** Formato dos erros de domínio da API. */
export interface ApiError {
  code: string
  message: string
}

export interface User {
  id: number
  email: string
  name: string
}

/**Resposta de login e refresh. */
export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}
