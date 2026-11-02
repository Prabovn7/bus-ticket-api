import { useEffect, useState } from 'react'
import { getAvailability } from '../api/booking'
import { ApiRequestError } from '../api/client'
import type { TripResult } from '../api/types'

// Limite da API por chamada. Viagens além dele ficam sem número (a tela mostra o total).
const MAX_TRIPS_PER_REQUEST = 50

interface Settled {
  trips: TripResult[]
  free: ReadonlyMap<number, number>
}

/**
 * Assentos livres por viagem, ou null enquanto não há resposta para ESTA lista de viagens.
 * Se a consulta falha, devolve um mapa vazio: o quadro continua útil, só sem os números.
 * A identidade da lista (e não os ids) decide quando consultar: buscar de novo as mesmas
 * viagens traz números novos.
 */
export function useFreeSeats(trips: TripResult[] | null): ReadonlyMap<number, number> | null {
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    if (!trips || trips.length === 0) {
      return
    }
    const controller = new AbortController()
    const ids = trips.slice(0, MAX_TRIPS_PER_REQUEST).map((trip) => trip.trip_id)
    getAvailability(ids, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return
        setSettled({ trips, free: new Map(rows.map((row) => [row.trip_id, row.free])) })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiRequestError) {
          setSettled({ trips, free: new Map() })
        } else {
          throw error
        }
      })
    return () => controller.abort()
  }, [trips])

  return trips && settled?.trips === trips ? settled.free : null
}
