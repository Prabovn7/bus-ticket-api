import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError } from '../api/client'
import { listReservations } from '../api/reservations'
import type { Reservation } from '../api/types'

export type ReservationsState =
  | { status: 'loading' }
  | { status: 'success'; reservations: Reservation[] }
  | { status: 'error'; error: ApiRequestError }

interface Settled {
  attempt: number
  state: Exclude<ReservationsState, { status: 'loading' }>
}

/** Carrega as reservas da pessoa logada. `reload` pede de novo. */
export function useReservations() {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listReservations(controller.signal)
      .then((reservations) => {
        if (controller.signal.aborted) return
        setSettled({ attempt, state: { status: 'success', reservations } })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiRequestError) {
          setSettled({ attempt, state: { status: 'error', error } })
        } else {
          throw error
        }
      })
    return () => controller.abort()
  }, [attempt])

  const reload = useCallback(() => setAttempt((current) => current + 1), [])

  // O resultado guardado só vale para o pedido atual; de outro modo o estado é "loading".
  const state: ReservationsState =
    settled?.attempt === attempt ? settled.state : { status: 'loading' }
  return { state, reload }
}
