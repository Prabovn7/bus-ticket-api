import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Hold } from '../api/types'
import HoldPanel from './HoldPanel'

const hold: Hold = {
  id: 31,
  trip_id: 7,
  seat_number: 12,
  origin_position: 1,
  destination_position: 4,
  status: 'held',
  price_cents: 7990,
  expires_at: '2026-11-20T12:10:00Z',
  expires_in_seconds: 600,
}

describe('HoldPanel', () => {
  it('avisa, uma vez, qual assento ficou reservado para a pessoa', () => {
    render(<HoldPanel hold={hold} seconds={600} />)

    expect(screen.getByRole('status')).toHaveTextContent('Assento 12 reservado para você.')
  })

  it('mostra o valor da passagem', () => {
    render(<HoldPanel hold={hold} seconds={600} />)

    expect(screen.getByText(/^Valor:/)).toHaveTextContent(/^Valor: R\$\s79,90$/)
  })

  it('mostra o tempo que falta como minutos e segundos, num timer', () => {
    render(<HoldPanel hold={hold} seconds={599} />)

    const timer = screen.getByRole('timer')
    expect(timer).toHaveTextContent('09:59')
    expect(timer).toHaveAttribute('datetime', 'PT599S')
  })

  it('o tempo que muda a cada segundo não é anunciado pelo leitor de tela', () => {
    render(<HoldPanel hold={hold} seconds={599} />)

    expect(screen.getByRole('timer')).not.toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('timer').closest('[aria-live]')).toBeNull()
  })

  it('explica o que acontece quando o tempo acaba', () => {
    render(<HoldPanel hold={hold} seconds={600} />)

    expect(
      screen.getByText('Se o tempo acabar, o assento volta a ficar livre para outras pessoas.'),
    ).toBeInTheDocument()
  })
})
