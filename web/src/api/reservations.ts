import { authedFetch } from '../auth/authedFetch'
import type { Reservation } from './types'

/** Reservas da pessoa logada (até 50, as mais novas primeiro). Exige login. */
export function listReservations(signal?: AbortSignal): Promise<Reservation[]> {
  return authedFetch<Reservation[]>('/api/reservations', signal ? { signal } : undefined)
}

/** Uma reserva da pessoa logada, pelo id. Exige login; 404 se não existir ou não for dela. */
export function getReservation(id: number, signal?: AbortSignal): Promise<Reservation> {
  return authedFetch<Reservation>(`/api/reservations/${id}`, signal ? { signal } : undefined)
}
