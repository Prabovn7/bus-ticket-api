import { authedFetch } from '../auth/authedFetch'
import type { CancelResult, Reservation } from './types'

/** Reservas da pessoa logada (até 50, as mais novas primeiro). Exige login. */
export function listReservations(signal?: AbortSignal): Promise<Reservation[]> {
  return authedFetch<Reservation[]>('/api/reservations', signal ? { signal } : undefined)
}

/** Uma reserva da pessoa logada, pelo id. Exige login; 404 se não existir ou não for dela. */
export function getReservation(id: number, signal?: AbortSignal): Promise<Reservation> {
  return authedFetch<Reservation>(`/api/reservations/${id}`, signal ? { signal } : undefined)
}

/**
 * Cancela uma reserva da pessoa logada. Exige login.
 *
 * Sem Idempotency-Key e sem corpo: o servidor cancela uma vez só, pelo estado da reserva, e
 * repetir o pedido devolve o mesmo resultado sem estornar de novo. Erros de regra (404, 409)
 * lançam ApiRequestError.
 */
export function cancelReservation(id: number, signal?: AbortSignal): Promise<CancelResult> {
  return authedFetch<CancelResult>(`/api/reservations/${id}/cancel`, {
    method: 'POST',
    ...(signal ? { signal } : {}),
  })
}
