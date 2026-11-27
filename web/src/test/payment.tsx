import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import type { Payment, Reservation, User } from '../api/types'
import { routes } from '../router'
import { authWrapper, fakeAuth } from './auth'
import { jsonResponse } from './http'

/** O que os testes da página de pagamento têm em comum: a pessoa, a reserva e o roteiro da API. */

export const ME: User = { id: 1, email: 'ana@exemplo.com', name: 'Ana' }

export const approved: Payment = { payment_id: 9, status: 'approved', reservation_status: 'paid' }
export const declined: Payment = { payment_id: 9, status: 'declined', reservation_status: 'held' }

export function reservationOf(overrides: Partial<Reservation> = {}): Reservation {
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

/** Uma resposta que só chega quando o teste mandar: deixa o pedido "em andamento". */
export function deferred() {
  let resolve: (response: Response) => void = () => {}
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve: (response: Response) => resolve(response) }
}

export type PayReply = Response | Promise<Response> | Error

export interface PayCall {
  method: string | undefined
  key: string | null
  body: unknown
}

/**
 * Responde à reserva e, na ordem do roteiro, a cada pedido de pagamento (um Error vira falha de
 * rede). Sem roteiro, o pagamento é aprovado. Anota o método, a chave e o corpo de cada pedido.
 */
export function stubPaymentApi(pays: PayReply[], reservation: Reservation = reservationOf()) {
  const queue = [...pays]
  const payCalls: PayCall[] = []

  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = String(input)
    if (url === '/api/reservations/31') {
      return Promise.resolve(jsonResponse(reservation))
    }
    if (url === '/api/reservations/31/pay') {
      payCalls.push({
        method: init?.method,
        key: new Headers(init?.headers).get('Idempotency-Key'),
        body: JSON.parse(String(init?.body)),
      })
      const next = queue.shift()
      if (next instanceof Error) {
        return Promise.reject(next)
      }
      return Promise.resolve(next ?? jsonResponse(approved))
    }
    return Promise.reject(new Error(`Chamada inesperada: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { payCalls }
}

/** Abre a página de pagamento da reserva 31 com a pessoa logada. */
export function renderPayment() {
  const router = createMemoryRouter(routes, { initialEntries: ['/reservas/31/pagamento'] })
  return render(<RouterProvider router={router} />, {
    wrapper: authWrapper(fakeAuth({ status: 'authenticated', user: ME })),
  })
}

export const payButton = () => screen.findByRole('button', { name: 'Pagar' })
export const offline = () => new TypeError('Failed to fetch')
