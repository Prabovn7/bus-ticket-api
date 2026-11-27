import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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

/** O painel tem um link, e um link só funciona dentro de um roteador. */
function renderPanel(seconds: number) {
  return render(<HoldPanel hold={hold} seconds={seconds} />, { wrapper: MemoryRouter })
}

describe('HoldPanel', () => {
  it('avisa, uma vez, qual assento ficou reservado para a pessoa', () => {
    renderPanel(600)

    expect(screen.getByRole('status')).toHaveTextContent('Assento 12 reservado para você.')
  })

  it('mostra o valor da passagem', () => {
    renderPanel(600)

    expect(screen.getByText(/^Valor:/)).toHaveTextContent(/^Valor: R\$\s79,90$/)
  })

  it('mostra o tempo que falta como minutos e segundos, num timer', () => {
    renderPanel(599)

    const timer = screen.getByRole('timer')
    expect(timer).toHaveTextContent('09:59')
    expect(timer).toHaveAttribute('datetime', 'PT599S')
  })

  it('o tempo que muda a cada segundo não é anunciado pelo leitor de tela', () => {
    renderPanel(599)

    expect(screen.getByRole('timer')).not.toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('timer').closest('[aria-live]')).toBeNull()
  })

  it('explica o que acontece quando o tempo acaba', () => {
    renderPanel(600)

    expect(
      screen.getByText('Se o tempo acabar, o assento volta a ficar livre para outras pessoas.'),
    ).toBeInTheDocument()
  })

  it('tem o link "Ir para o pagamento", que leva à página de pagamento da reserva', () => {
    renderPanel(600)

    expect(screen.getByRole('link', { name: 'Ir para o pagamento' })).toHaveAttribute(
      'href',
      '/reservas/31/pagamento',
    )
  })
})
