import type { TripResult } from '../api/types'
import { formatBRL, formatClock, formatDay, formatDuration, isNextDay } from '../lib/formatting'

interface TripBoardProps {
  trips: TripResult[]
  origin: string
  destination: string
  date: string
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
}

function formatSeats(capacity: number): string {
  return `${capacity} ${capacity === 1 ? 'livre' : 'livres'}`
}

function TripBoard({ trips, origin, destination, date }: TripBoardProps) {
  return (
    <div className="quadro">
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
          </tr>
        </thead>
        <tbody>
          {trips.map((trip) => (
            <tr key={trip.trip_id}>
              <td className="hora">{formatClock(trip.departure_at)}</td>
              <td>
                <span className="hora">{formatClock(trip.arrival_at)}</span>
                {isNextDay(trip.departure_at, trip.arrival_at) && (
                  <small className="dia-seguinte">no dia seguinte</small>
                )}
              </td>
              <td>{formatDuration(minutesBetween(trip.departure_at, trip.arrival_at))}</td>
              <td>{formatSeats(trip.capacity)}</td>
              <td className="preco">{formatBRL(trip.price_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="lista-viagens" aria-label="Viagens disponíveis">
        {trips.map((trip) => (
          <li key={trip.trip_id} className="viagem">
            <div className="viagem-horas">
              <span className="hora">{formatClock(trip.departure_at)}</span>
              <span>até</span>
              <span className="hora">{formatClock(trip.arrival_at)}</span>
            </div>
            {isNextDay(trip.departure_at, trip.arrival_at) && (
              <small className="dia-seguinte">no dia seguinte</small>
            )}
            <div className="viagem-detalhes">
              <span>{formatDuration(minutesBetween(trip.departure_at, trip.arrival_at))}</span>
              <span>{formatSeats(trip.capacity)}</span>
              <strong className="preco">{formatBRL(trip.price_cents)}</strong>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default TripBoard
