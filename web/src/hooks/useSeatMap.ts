import { useCallback, useEffect, useState } from 'react'
import { getSeatMap } from '../api/booking'
import { ApiRequestError } from '../api/client'
import type { SeatMap } from '../api/types'

export type SeatMapState =
  | { status: 'loading' }
  | { status: 'success'; seatMap: SeatMap }
  | { status: 'error'; error: ApiRequestError }

interface Settled {
  key: string
  state: Exclude<SeatMapState, { status: 'loading' }>
}

export function useSeatMap(tripId: number) {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)
  // Cada (viagem, tentativa) é um pedido. O resultado guardado só vale para o pedido atual;
  // de outro modo o estado é "loading" sem precisar de setState dentro do efeito.
  const key = `${tripId}:${attempt}`

  useEffect(() => {
    const controller = new AbortController()
    getSeatMap(tripId, controller.signal)
      .then((seatMap) => {
        if (controller.signal.aborted) return
        setSettled({ key, state: { status: 'success', seatMap } })
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
  }, [tripId, key])

  const reload = useCallback(() => setAttempt((current) => current + 1), [])

  const state: SeatMapState = settled?.key === key ? settled.state : { status: 'loading' }
  return { state, reload }
}
