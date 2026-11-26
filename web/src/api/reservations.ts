import { authedFetch } from '../auth/authedFetch'
import type { Reservation } from './types'

/** Reservas da pessoa logada (até 50, as mais novas primeiro). Exige login. */
export function listReservations(signal?: AbortSignal): Promise<Reservation[]> {
  return authedFetch<Reservation[]>('/api/reservations', signal ? { signal } : undefined)
}
