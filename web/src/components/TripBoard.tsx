import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef } from 'react'
import { Link } from 'react-router'
import type { TripResult } from '../api/types'
import { formatBRL, formatClock, formatDay, formatDuration, isNextDay } from '../lib/formatting'
import { useReducedMotion } from '../motion/useReducedMotion'
import FlapTime from './FlapTime'

gsap.registerPlugin(useGSAP)

// Os dois layouts (tabela e lista do celular) ficam no DOM; cada um entra em até 0,4 s de
// atraso somado, mais os 0,22 s de cada linha.
const ROW_SECONDS = 0.22
const MAX_STAGGER_TOTAL = 0.4
const MAX_STAGGER_EACH = 0.04

interface TripBoardProps {
  trips: TripResult[]
  origin: string
  destination: string
  date: string
  /** Assentos livres por viagem; sem o número, o quadro mostra só o total de lugares. */
  free?: ReadonlyMap<number, number> | null
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
}

function formatSeats(
  trip: TripResult,
  free: ReadonlyMap<number, number> | null | undefined,
): string {
  const left = free?.get(trip.trip_id)
  if (left === undefined) {
    return `${trip.capacity} ${trip.capacity === 1 ? 'lugar' : 'lugares'}`
  }
  return `${left} ${left === 1 ? 'livre' : 'livres'}`
}

function seatLinkLabel(trip: TripResult): string {
  return `Escolher assento na viagem das ${formatClock(trip.departure_at)}`
}

function TripBoard({ trips, origin, destination, date, free }: TripBoardProps) {
  const root = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  // Chave das viagens: renderizar de novo os mesmos dados não repete a animação.
  const tripKey = trips.map((trip) => trip.trip_id).join(',')

  useGSAP(
    () => {
      if (reduced || !root.current) {
        return
      }
      for (const selector of ['tbody tr', 'ul > li']) {
        const rows = gsap.utils.toArray<HTMLElement>(selector, root.current)
        if (rows.length === 0) {
          continue
        }
        gsap.fromTo(
          rows,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: ROW_SECONDS,
            ease: 'power2.out',
            stagger: Math.min(MAX_STAGGER_EACH, MAX_STAGGER_TOTAL / rows.length),
            clearProps: 'opacity,transform',
          },
        )
      }
    },
    { scope: root, dependencies: [tripKey, reduced], revertOnUpdate: true },
  )

  return (
    <div ref={root} className="quadro">
      <table className="tabela-viagens">
        <caption>
          Viagens de {origin} para {destination} em {formatDay(date)}
        </caption>
        <thead>
          <tr>
            <th scope="col">Saída</th>
            <th scope="col">Chegada</th>
            <th scope="col">Duração</th>
            <th scope="col">Lugares</th>
            <th scope="col">Preço</th>
            <th scope="col">
              <span className="so-leitor">Assento</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {trips.map((trip) => (
            <tr key={trip.trip_id}>
              <td className="hora">
                <FlapTime value={formatClock(trip.departure_at)} />
              </td>
              <td>
                <span className="hora">
                  <FlapTime value={formatClock(trip.arrival_at)} />
                </span>
                {isNextDay(trip.departure_at, trip.arrival_at) && (
                  <small className="dia-seguinte">no dia seguinte</small>
                )}
              </td>
              <td>{formatDuration(minutesBetween(trip.departure_at, trip.arrival_at))}</td>
              <td>{formatSeats(trip, free)}</td>
              <td className="preco">{formatBRL(trip.price_cents)}</td>
              <td>
                <Link
                  className="botao botao-quadro"
                  to={`/viagens/${trip.trip_id}`}
                  aria-label={seatLinkLabel(trip)}
                >
                  Escolher assento
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="lista-viagens" aria-label="Viagens disponíveis">
        {trips.map((trip) => (
          <li key={trip.trip_id} className="viagem">
            <div className="viagem-horas">
              <span className="hora">
                <FlapTime value={formatClock(trip.departure_at)} />
              </span>
              <span>até</span>
              <span className="hora">
                <FlapTime value={formatClock(trip.arrival_at)} />
              </span>
            </div>
            {isNextDay(trip.departure_at, trip.arrival_at) && (
              <small className="dia-seguinte">no dia seguinte</small>
            )}
            <div className="viagem-detalhes">
              <span>{formatDuration(minutesBetween(trip.departure_at, trip.arrival_at))}</span>
              <span>{formatSeats(trip, free)}</span>
              <strong className="preco">{formatBRL(trip.price_cents)}</strong>
            </div>
            <Link
              className="botao botao-quadro"
              to={`/viagens/${trip.trip_id}`}
              aria-label={seatLinkLabel(trip)}
            >
              Escolher assento
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default TripBoard
