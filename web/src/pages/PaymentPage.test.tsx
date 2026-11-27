import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Reservation, User } from '../api/types'
import { routes } from '../router'
import { authWrapper, fakeAuth } from '../test/auth'
import { controllableFetch, jsonResponse, stubRoutes } from '../test/http'

const user: User = { id: 1, email: 'ana@exemplo.com', name: 'Ana' }

function reservationOf(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 31,
    trip_id: 7,
    seat_number: 12,
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

function renderAt(path: string, auth = fakeAuth({ status: 'authenticated', user })) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />, { wrapper: authWrapper(auth) })
  return { router, ...view }
}

describe('PaymentPage', () => {
  it('sem login, manda para o Entrar e guarda de onde a pessoa veio', async () => {
    const { seen } = stubRoutes({})
    const { router } = renderAt('/reservas/31/pagamento', fakeAuth())

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/entrar')
    expect(router.state.location.state).toEqual({ from: '/reservas/31/pagamento' })
    expect(seen).toHaveLength(0)
  })

  it('enquanto a sessão carrega, espera: não manda para o Entrar nem chama a API', () => {
    const { seen } = stubRoutes({})
    const { router } = renderAt('/reservas/31/pagamento', fakeAuth({ status: 'loading' }))

    expect(screen.getByRole('status')).toHaveTextContent('Carregando reserva')
    expect(router.state.location.pathname).toBe('/reservas/31/pagamento')
    expect(seen).toHaveLength(0)
  })

  it('com a pessoa logada, tem o título "Pagamento" e mostra o resumo da reserva', async () => {
    const { seen } = stubRoutes({ '/api/reservations/31': [jsonResponse(reservationOf())] })
    renderAt('/reservas/31/pagamento')

    expect(screen.getByRole('heading', { level: 1, name: 'Pagamento' })).toBeInTheDocument()
    expect(document.title).toBe('Pagamento | Ônibora')
    expect(await screen.findByText('Assento: 12')).toBeInTheDocument()
    expect(screen.getByText(/^Valor:/)).toHaveTextContent(/^Valor: R\$\s79,90$/)
    expect(seen.map((call) => call.url)).toEqual(['/api/reservations/31'])
  })

  it('enquanto a reserva carrega, mostra "Carregando reserva"', () => {
    controllableFetch()
    renderAt('/reservas/31/pagamento')

    expect(screen.getByRole('status')).toHaveTextContent('Carregando reserva')
  })

  it('um id que não é número mostra "Reserva não encontrada." sem chamar a API', () => {
    const { seen } = stubRoutes({})
    renderAt('/reservas/abc/pagamento')

    expect(screen.getByRole('alert')).toHaveTextContent('Reserva não encontrada.')
    expect(seen).toHaveLength(0)
  })

  it('reserva que não existe mostra a mensagem da API, sem botão de tentar de novo', async () => {
    stubRoutes({
      '/api/reservations/99': [
        jsonResponse({ code: 'reservation_not_found', message: 'Reserva não encontrada.' }, 404),
      ],
    })
    renderAt('/reservas/99/pagamento')

    expect(await screen.findByRole('alert')).toHaveTextContent('Reserva não encontrada.')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('falha de rede oferece "Tentar de novo"', async () => {
    stubRoutes({})
    renderAt('/reservas/31/pagamento')

    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('reserva que não está mais aguardando pagamento avisa e não mostra o valor', async () => {
    stubRoutes({ '/api/reservations/31': [jsonResponse(reservationOf({ status: 'paid' }))] })
    renderAt('/reservas/31/pagamento')

    expect(
      await screen.findByText('Esta reserva não está aguardando pagamento.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^Valor:/)).toBeNull()
  })
})
