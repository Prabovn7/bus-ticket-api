import { render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import type { TripResult } from '../api/types'
import { mockMotionPreference } from '../test/motion'
import TripBoard from './TripBoard'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 08:00 → 14:30, 23:00 → 05:30 e 10:00 → 16:30 em São Paulo.
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
  {
    trip_id: 3,
    departure_at: '2026-10-21T13:00:00Z',
    arrival_at: '2026-10-21T19:30:00Z',
    price_cents: 16000,
    capacity: 40,
  },
]

function board(list: TripResult[] = trips) {
  return <TripBoard trips={list} origin="São Paulo" destination="Uberaba" date="2026-10-20" />
}

/** As linhas da tabela e os itens da lista do celular: os dois layouts existem no DOM. */
function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('tbody tr, ul > li'))
}

/** Visível quando ninguém mexeu na opacidade ou quando ela chegou a 1. */
function isVisible(element: HTMLElement): boolean {
  return element.style.opacity === '' || Number(element.style.opacity) === 1
}

describe('TripBoard: horários e entrada das linhas', () => {
  it('mostra cada horário como placa: texto acessível uma vez e folhas escondidas', () => {
    render(board())
    const table = screen.getByRole('table')

    expect(within(table).getAllByText(/^\d{2}:\d{2}$/)).toHaveLength(6)
    expect(within(table).getByText('08:00')).toBeInTheDocument()
    expect(table.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(6)
  })

  it('as linhas começam escondidas e terminam visíveis em até 1,5 s', async () => {
    const { container } = render(board())
    const all = rows(container)

    expect(all).toHaveLength(6)
    expect(all.every((row) => !isVisible(row))).toBe(true)
    await waitFor(() => expect(all.every(isVisible)).toBe(true), { timeout: 1500 })
  })

  it('com movimento reduzido, as linhas aparecem de uma vez, sem estilo inline', async () => {
    mockMotionPreference(true)
    const { container } = render(board())
    const all = rows(container)

    expect(all.every(isVisible)).toBe(true)
    await wait(300)
    expect(all.every((row) => row.getAttribute('style') === null)).toBe(true)
  })

  it('renderizar os mesmos dados de novo não repete a animação', async () => {
    const { container, rerender } = render(board())
    await waitFor(() => expect(rows(container).every(isVisible)).toBe(true), { timeout: 1500 })

    rerender(board([...trips]))

    expect(rows(container).every(isVisible)).toBe(true)
    await wait(300)
    expect(rows(container).every(isVisible)).toBe(true)
  })

  it('uma nova busca, com outras viagens, anima de novo', async () => {
    const { container, rerender } = render(board())
    await waitFor(() => expect(rows(container).every(isVisible)).toBe(true), { timeout: 1500 })

    rerender(board(trips.slice(0, 2)))

    expect(rows(container).every((row) => !isVisible(row))).toBe(true)
    await waitFor(() => expect(rows(container).every(isVisible)).toBe(true), { timeout: 1500 })
  })

  it('no StrictMode nenhuma linha fica presa invisível', async () => {
    const { container } = render(<StrictMode>{board()}</StrictMode>)

    await waitFor(() => expect(rows(container).every(isVisible)).toBe(true), { timeout: 1500 })
    await wait(300)
    expect(rows(container).every(isVisible)).toBe(true)
  })
})
