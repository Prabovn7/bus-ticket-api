import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TripResult } from '../api/types'
import { render } from '../test/render'
import TripBoard from './TripBoard'

// 08:00 e 23:00 em São Paulo.
const trips: TripResult[] = [
  {
    trip_id: 1,
    departure_at: '2026-10-20T11:00:00Z',
    arrival_at: '2026-10-20T17:30:00Z',
    price_cents: 14500,
    capacity: 40,
  },
  {
    trip_id: 2,
    departure_at: '2026-10-21T02:00:00Z',
    arrival_at: '2026-10-21T08:30:00Z',
    price_cents: 14500,
    capacity: 40,
  },
]

function renderBoard() {
  return render(
    <TripBoard trips={trips} origin="São Paulo" destination="Uberaba" date="2026-10-20" />,
  )
}

describe('TripBoard: link para escolher o assento', () => {
  it('cada viagem tem um link para a página dela, na tabela e na lista do celular', () => {
    renderBoard()

    const links = screen.getAllByRole('link', { name: 'Escolher assento na viagem das 08:00' })

    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/viagens/1')
    }
  })

  it('viagens diferentes levam a páginas diferentes', () => {
    renderBoard()

    const links = screen.getAllByRole('link', { name: 'Escolher assento na viagem das 23:00' })

    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/viagens/2')
    }
  })

  it('o texto visível é "Escolher assento"; o nome acessível só acrescenta a viagem', () => {
    renderBoard()

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveTextContent(/^Escolher assento$/)
      expect(link.getAttribute('aria-label')).toMatch(/^Escolher assento /)
    }
  })

  it('a coluna do link tem um cabeçalho lido pelo leitor de tela', () => {
    renderBoard()

    const table = screen.getByRole('table')

    expect(within(table).getByRole('columnheader', { name: 'Assento' })).toBeInTheDocument()
    expect(within(table).getAllByRole('columnheader')).toHaveLength(6)
  })
})
