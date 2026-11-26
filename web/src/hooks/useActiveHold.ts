import { useEffect, useState } from 'react'
import { listReservations } from '../api/reservations'
import type { Hold, Reservation } from '../api/types'

interface Found {
  tripId: number
  hold: Hold | null
}

/** Só uma reserva 'held' com prazo e tempo restante vira um hold que dá para retomar. */
function toHold(reservation: Reservation): Hold | null {
  if (
    reservation.status !== 'held' ||
    reservation.expires_at === null ||
    reservation.expires_in_seconds === null ||
    reservation.expires_in_seconds <= 0
  ) {
    return null
  }
  return {
    id: reservation.id,
    trip_id: reservation.trip_id,
    seat_number: reservation.seat_number,
    origin_position: reservation.origin_position,
    destination_position: reservation.destination_position,
    status: reservation.status,
    price_cents: reservation.price_cents,
    expires_at: reservation.expires_at,
    expires_in_seconds: reservation.expires_in_seconds,
  }
}

/**
 * O hold ativo da pessoa nesta viagem, para retomar a contagem depois de recarregar.
 *
 * Só consulta com `enabled` (pessoa logada). Se a consulta falhar, segue sem hold: a escolha
 * de assento continua funcionando. `ready` é falso só enquanto a consulta está em andamento.
 * O resultado guarda o tripId, então um resultado de outra viagem nunca é usado.
 */
export function useActiveHold(
  tripId: number,
  enabled: boolean,
): { hold: Hold | null; ready: boolean } {
  const [found, setFound] = useState<Found | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }
    const controller = new AbortController()
    listReservations(controller.signal)
      .then((reservations) => {
        const hold =
          reservations
            .filter((reservation) => reservation.trip_id === tripId)
            .map(toHold)
            .find((candidate): candidate is Hold => candidate !== null) ?? null
        setFound({ tripId, hold })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFound({ tripId, hold: null })
        }
      })
    return () => controller.abort()
  }, [tripId, enabled])

  if (!enabled) {
    return { hold: null, ready: true }
  }
  const mine = found?.tripId === tripId ? found : null
  return { hold: mine?.hold ?? null, ready: mine !== null }
}
