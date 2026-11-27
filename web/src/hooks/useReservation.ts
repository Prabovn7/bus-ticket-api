import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError } from '../api/client'
import { getReservation } from '../api/reservations'
import type { Reservation } from '../api/types'

export type ReservationState =
  | { status: 'loading' }
  | { status: 'success'; reservation: Reservation }
  | { status: 'error'; error: ApiRequestError }

interface Settled {
  key: string
  state: Exclude<ReservationState, { status: 'loading' }>
}

/** Carrega uma reserva da pessoa logada pelo id. `reload` pede de novo. */
export function useReservation(reservationId: number) {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)
  // Cada (reserva, tentativa) é um pedido. O resultado guardado só vale para o pedido atual;
  // de outro modo o estado é "loading" sem precisar de setState dentro do efeito.
  const key = `${reservationId}:${attempt}`

  useEffect(() => {
    const controller = new AbortController()
    getReservation(reservationId, controller.signal)
      .then((reservation) => {
        if (controller.signal.aborted) return
        setSettled({ key, state: { status: 'success', reservation } })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiRequestError) {
          setSettled({ key, state: { status: 'error', error } })
        } else {
          throw error
        }
      })
    return () => controller.abort()
  }, [reservationId, key])

  const reload = useCallback(() => setAttempt((current) => current + 1), [])

  const state: ReservationState = settled?.key === key ? settled.state : { status: 'loading' }
  return { state, reload }
}
