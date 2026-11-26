import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Reservation, Seat, SeatMap, User } from '../api/types'
import type { AuthContextValue } from '../auth/authContext'
import { routes } from '../router'
import { authWrapper, fakeAuth } from '../test/auth'
import { jsonResponse } from '../test/http'

const ME: User = { id: 1, email: 'ana@exemplo.com', name: 'Ana' }
const LOGGED_IN = fakeAuth({ status: 'authenticated', user: ME })

function mapOf(heldSeat?: number): Response {
  const seats: Seat[] = Array.from({ length: 40 }, (_, index) => ({
    seat_number: index + 1,
    status: index + 1 === heldSeat ? 'held' : 'free',
  }))
  const body: SeatMap = { trip_id: 7, capacity: 40, seats }
  return jsonResponse(body)
}

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 31,
    trip_id: 7,
    seat_number: 7,
    origin_position: 1,
    destination_position: 4,
    status: 'held',
    price_cents: 7990,
    expires_at: '2026-11-20T12:10:00Z',
    expires_in_seconds: 540,
    payment_status: null,
    ...overrides,
  }
}

function stubApi(list: Reservation[] | Response) {
  const listCalls: { auth: string | null }[] = []
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = String(input)
    if (url === '/api/trips/7/seats') {
      return Promise.resolve(mapOf(7))
    }
    if (url === '/api/reservations') {
      listCalls.push({ auth: new Headers(init?.headers).get('Authorization') })
      return Promise.resolve(list instanceof Response ? list : jsonResponse(list))
    }
    return Promise.reject(new Error(`Chamada inesperada: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { listCalls }
}

function renderAt(path: string, auth: AuthContextValue = LOGGED_IN) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />, { wrapper: authWrapper(auth) })
}

describe('TripPage: retomar o hold ao carregar', () => {
  it('com um hold ativo nesta viagem, mostra o painel com o tempo que falta', async () => {
    stubApi([reservation()])
    renderAt('/viagens/7')

    expect(await screen.findByText('Assento 7 reservado para você.')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('09:00')
    expect(screen.queryByRole('group', { name: 'Escolha seu assento' })).toBeNull()
  })

  it('ignora reservas de outra viagem', async () => {
    stubApi([reservation({ trip_id: 8 })])
    renderAt('/viagens/7')

    expect(await screen.findByRole('group', { name: 'Escolha seu assento' })).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('ignora reservas que não estão held (paga, cancelada, expirada)', async () => {
    stubApi([
      reservation({ id: 1, status: 'paid', expires_in_seconds: null, payment_status: 'approved' }),
      reservation({ id: 2, status: 'cancelled', expires_in_seconds: null }),
      reservation({ id: 3, status: 'expired', expires_in_seconds: 0 }),
    ])
    renderAt('/viagens/7')

    expect(await screen.findByRole('group', { name: 'Escolha seu assento' })).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('ignora um hold com 0 segundos restantes', async () => {
    stubApi([reservation({ expires_in_seconds: 0 })])
    renderAt('/viagens/7')

    expect(await screen.findByRole('group', { name: 'Escolha seu assento' })).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('sem login, nem pergunta pelas reservas', async () => {
    const { listCalls } = stubApi([reservation()])
    renderAt('/viagens/7', fakeAuth())

    expect(await screen.findByRole('group', { name: 'Escolha seu assento' })).toBeInTheDocument()
    expect(listCalls).toHaveLength(0)
  })

  it('se a lista falhar, a escolha de assento continua funcionando', async () => {
    stubApi(jsonResponse({ code: 'internal', message: 'Erro interno.' }, 500))
    renderAt('/viagens/7')

    expect(await screen.findByRole('group', { name: 'Escolha seu assento' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
