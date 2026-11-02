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

export type SeatState = 'free' | 'held' | 'taken'

export interface Seat {
  seat_number: number
  status: SeatState
}

/** Resposta de GET /api/trips/{id}/seats. */
export interface SeatMap {
  trip_id: number
  capacity: number
  seats: Seat[]
}

/** Um item de GET /api/trips/availability: quantos assentos estão livres agora. */
export interface TripAvailability {
  trip_id: number
  capacity: number
  free: number
}

/** Resposta de POST /api/trips/{id}/holds: o assento fica seu até expirar. */
export interface Hold {
  id: number
  trip_id: number
  seat_number: number
  origin_position: number
  destination_position: number
  status: string
  price_cents: number
  expires_at: string // ISO 8601, em UTC
  expires_in_seconds: number // segundos que faltam, pelo relógio do servidor
}
