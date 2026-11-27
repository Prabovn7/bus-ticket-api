import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import type { AuthContextValue } from '../auth/authContext'
import { routes } from '../router'
import { authWrapper, fakeAuth } from './auth'
import { ME, reservationOf } from './payment'

/** O que os testes de "Minhas reservas" têm em comum: as reservas, o roteiro da API e a tela aberta. */

/** A situação "em espera" (held) é a de reservationOf: assento 12 da viagem 7, R$ 79,90. */
export const heldReservation = reservationOf({ id: 31, trip_id: 7, seat_number: 12 })

export const paidReservation = reservationOf({
  id: 32,
  trip_id: 8,
  seat_number: 5,
  status: 'paid',
  price_cents: 10500,
  expires_at: null,
  expires_in_seconds: null,
  payment_status: 'approved',
})

export const cancelledReservation = reservationOf({
  id: 33,
  trip_id: 9,
  seat_number: 20,
  status: 'cancelled',
  price_cents: 4000,
  expires_at: null,
  expires_in_seconds: null,
  payment_status: 'refunded',
})

export const expiredReservation = reservationOf({
  id: 34,
  trip_id: 10,
  seat_number: 3,
  status: 'expired',
  expires_in_seconds: 0,
})

/** Uma resposta pronta, uma que só chega depois, ou um Error (vira falha de rede). */
export type ApiReply = Response | Promise<Response> | Error

export interface CancelCall {
  id: number
  method: string | undefined
}

function answer(next: ApiReply | undefined): Promise<Response> {
  if (next === undefined) {
    return Promise.reject(new Error('Chamada fora do roteiro'))
  }
  return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
}

/**
 * Responde à lista de reservas e, na ordem do roteiro, a cada pedido de cancelamento. Uma
 * chamada além do roteiro falha, então uma leitura ou um cancelamento a mais derruba o teste.
 */
export function stubMyReservationsApi(lists: ApiReply[], cancels: ApiReply[] = []) {
  const listQueue = [...lists]
  const cancelQueue = [...cancels]
  const cancelCalls: CancelCall[] = []
  let listReads = 0

  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = String(input)
    if (url === '/api/reservations') {
      listReads += 1
      return answer(listQueue.shift())
    }
    const cancel = /^\/api\/reservations\/(\d+)\/cancel$/.exec(url)
    if (cancel) {
      cancelCalls.push({ id: Number(cancel[1]), method: init?.method })
      return answer(cancelQueue.shift())
    }
    return Promise.reject(new Error(`Chamada inesperada: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { cancelCalls, listReads: () => listReads }
}

/** Abre /minhas-reservas, por padrão com a pessoa logada. */
export function renderMyReservations(
  auth: AuthContextValue = fakeAuth({ status: 'authenticated', user: ME }),
) {
  const router = createMemoryRouter(routes, { initialEntries: ['/minhas-reservas'] })
  const view = render(<RouterProvider router={router} />, { wrapper: authWrapper(auth) })
  return { router, ...view }
}

/** O item da lista que mostra "Assento N". */
export async function itemFor(seat: number): Promise<HTMLElement> {
  const item = (await screen.findByText(`Assento ${seat}`)).closest('li')
  if (!item) {
    throw new Error(`O assento ${seat} não está dentro de um item da lista`)
  }
  return item
}
