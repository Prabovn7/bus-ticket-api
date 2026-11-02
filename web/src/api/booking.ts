import { authedFetch } from '../auth/authedFetch'
import { apiFetch } from './client'
import type { Hold, SeatMap, TripAvailability } from './types'

/** Estado dos assentos de uma viagem. Público: não precisa de login. */
export function getSeatMap(tripId: number, signal?: AbortSignal): Promise<SeatMap> {
  return apiFetch<SeatMap>(`/api/trips/${tripId}/seats`, signal ? { signal } : undefined)
}

/** Assentos livres de várias viagens numa chamada só (a API aceita até 50). Público. */
export function getAvailability(
  tripIds: number[],
  signal?: AbortSignal,
): Promise<TripAvailability[]> {
  const params = new URLSearchParams()
  for (const id of tripIds) {
    params.append('trip_ids', String(id))
  }
  return apiFetch<TripAvailability[]>(
    `/api/trips/availability?${params.toString()}`,
    signal ? { signal } : undefined,
  )
}

/** Segura um assento por alguns minutos. Exige login; 409 se alguém já o segurou. */
export function createHold(
  tripId: number,
  seatNumber: number,
  signal?: AbortSignal,
): Promise<Hold> {
  return authedFetch<Hold>(`/api/trips/${tripId}/holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seat_number: seatNumber }),
    ...(signal ? { signal } : {}),
  })
}
