import { apiFetch } from './client'
import type { SeatMap } from './types'

/** Estado dos assentos de uma viagem. Público: não precisa de login. */
export function getSeatMap(tripId: number, signal?: AbortSignal): Promise<SeatMap> {
  return apiFetch<SeatMap>(`/api/trips/${tripId}/seats`, signal ? { signal } : undefined)
}
