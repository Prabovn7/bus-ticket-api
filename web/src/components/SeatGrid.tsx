import { useId } from 'react'
import type { Seat } from '../api/types'

interface SeatGridProps {
  seats: Seat[]
  selected: number | null
  onSelect: (seatNumber: number) => void
}

const SEATS_PER_ROW = 4
const AISLE_AFTER = 2

type Look = 'livre' | 'selecionado' | 'reservado' | 'ocupado'

const SPOKEN: Record<Seat['status'], string> = {
  free: 'livre',
  held: 'reservado por outra pessoa',
  taken: 'ocupado',
}

// Marcas visuais além da cor; o leitor de tela usa só o nome acessível do radio.
const MARKS: Record<Look, string> = { livre: '', selecionado: '✓', reservado: '...', ocupado: '×' }

function chunk(seats: Seat[]): Seat[][] {
  const rows: Seat[][] = []
  for (let start = 0; start < seats.length; start += SEATS_PER_ROW) {
    rows.push(seats.slice(start, start + SEATS_PER_ROW))
  }
  return rows
}

function lookOf(seat: Seat, selected: number | null): Look {
  if (seat.seat_number === selected) return 'selecionado'
  if (seat.status === 'held') return 'reservado'
  if (seat.status === 'taken') return 'ocupado'
  return 'livre'
}

function SeatGrid({ seats, selected, onSelect }: SeatGridProps) {
  const groupName = useId()

  function renderSeat(seat: Seat) {
    const look = lookOf(seat, selected)
    return (
      <label key={seat.seat_number} className="assento" data-estado={look}>
        <input
          type="radio"
          name={groupName}
          value={seat.seat_number}
          checked={seat.seat_number === selected}
          disabled={seat.status !== 'free'}
          onChange={() => onSelect(seat.seat_number)}
          aria-label={`Assento ${seat.seat_number}, ${SPOKEN[seat.status]}`}
        />
        <span className="assento-caixa" aria-hidden="true">
          <span className="assento-numero">{seat.seat_number}</span>
          <span className="assento-marca">{MARKS[look]}</span>
        </span>
      </label>
    )
  }

  return (
    <fieldset className="assentos">
      <legend>Escolha seu assento</legend>
      <div className="assentos-grade">
        {chunk(seats).map((row) => (
          <div key={row[0]?.seat_number} className="fileira">
            {row.slice(0, AISLE_AFTER).map(renderSeat)}
            <span className="corredor" aria-hidden="true" />
            {row.slice(AISLE_AFTER).map(renderSeat)}
          </div>
        ))}
      </div>
      <ul className="assentos-legenda" aria-label="Legenda dos assentos">
        <li>Livre</li>
        <li>Selecionado</li>
        <li>Reservado por outra pessoa</li>
        <li>Ocupado</li>
      </ul>
    </fieldset>
  )
}

export default SeatGrid
