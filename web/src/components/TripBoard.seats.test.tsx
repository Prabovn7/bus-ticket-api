import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TripResult } from '../api/types'
import { render } from '../test/render'
import TripBoard from './TripBoard'

function tripOf(trip_id: number, capacity = 40): TripResult {
  return {
    trip_id,
    departure_at: '2026-10-20T11:00:00Z',
    arrival_at: '2026-10-20T17:30:00Z',
    price_cents: 14500,
    capacity,
  }
}

function renderBoard(trips: TripResult[], free?: ReadonlyMap<number, number> | null) {
  return render(
    <TripBoard
      trips={trips}
      origin="São Paulo"
      destination="Uberaba"
      date="2026-10-20"
      free={free}
    />,
  )
}

describe('TripBoard: lugares', () => {
  it('mostra os assentos livres de cada viagem, na tabela e na lista', () => {
    renderBoard(
      [tripOf(1), tripOf(2)],
      new Map([
        [1, 37],
        [2, 1],
      ]),
    )

    expect(screen.getAllByText('37 livres')).toHaveLength(2)
    expect(screen.getAllByText('1 livre')).toHaveLength(2)
    expect(screen.queryByText(/lugares/)).toBeNull()
  })

  it('zero livres aparece como "0 livres", não como a capacidade', () => {
    renderBoard([tripOf(1)], new Map([[1, 0]]))

    expect(screen.getAllByText('0 livres')).toHaveLength(2)
    expect(screen.queryByText(/lugares/)).toBeNull()
  })

  it.each([
    ['sem o mapa (undefined)', undefined],
    ['com o mapa ainda null', null],
    ['com o mapa vazio', new Map<number, number>()],
  ])('%s mostra os lugares totais, sem dizer que estão livres', (_label, free) => {
    renderBoard([tripOf(1), tripOf(2)], free)

    expect(screen.getAllByText('40 lugares')).toHaveLength(4)
    expect(screen.queryByText(/livre/)).toBeNull()
  })

  it('a viagem que falta no mapa mostra os lugares totais; as outras, os livres', () => {
    renderBoard([tripOf(1), tripOf(2)], new Map([[1, 12]]))

    expect(screen.getAllByText('12 livres')).toHaveLength(2)
    expect(screen.getAllByText('40 lugares')).toHaveLength(2)
  })

  it('com um lugar só, o total fica no singular', () => {
    renderBoard([tripOf(1, 1)])

    expect(screen.getAllByText('1 lugar')).toHaveLength(2)
  })
})
