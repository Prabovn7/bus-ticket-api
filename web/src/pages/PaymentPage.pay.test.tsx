import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Payment, Reservation, User } from '../api/types'
import { routes } from '../router'
import { authWrapper, fakeAuth } from '../test/auth'
import { jsonResponse } from '../test/http'

const ME: User = { id: 1, email: 'ana@exemplo.com', name: 'Ana' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const approved: Payment = { payment_id: 9, status: 'approved', reservation_status: 'paid' }
const declined: Payment = { payment_id: 9, status: 'declined', reservation_status: 'held' }

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

/** Uma resposta que só chega quando o teste mandar: deixa o pedido "em andamento". */
function deferred() {
  let resolve: (response: Response) => void = () => {}
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve: (response: Response) => resolve(response) }
}

type PayReply = Response | Promise<Response> | Error

interface PayCall {
  method: string | undefined
  key: string | null
  body: unknown
}

/**
 * Responde à reserva e, na ordem do roteiro, a cada pedido de pagamento (um Error vira falha de
 * rede). Sem roteiro, o pagamento é aprovado. Anota o método, a chave e o corpo de cada pedido.
 */
function stubApi(pays: PayReply[], reservation: Reservation = reservationOf()) {
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

function renderPayment() {
  const router = createMemoryRouter(routes, { initialEntries: ['/reservas/31/pagamento'] })
  return render(<RouterProvider router={router} />, {
    wrapper: authWrapper(fakeAuth({ status: 'authenticated', user: ME })),
  })
}

const payButton = () => screen.findByRole('button', { name: 'Pagar' })
const offline = () => new TypeError('Failed to fetch')

describe('PaymentPage: pagar', () => {
  it('mostra o botão Pagar e o modo demonstração, com a aprovação marcada', async () => {
    stubApi([])
    renderPayment()

    expect(await payButton()).toBeEnabled()
    const group = screen.getByRole('group', { name: 'Modo demonstração' })
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Aprovar o pagamento' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Recusar o pagamento' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Deixar em análise' })).not.toBeChecked()
  })

  it('Pagar envia o POST com a chave de idempotência e o cenário "approve"', async () => {
    const { payCalls } = stubApi([])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())

    await waitFor(() => expect(payCalls).toHaveLength(1))
    expect(payCalls[0]?.method).toBe('POST')
    expect(payCalls[0]?.key).toMatch(UUID)
    expect(payCalls[0]?.body).toEqual({ scenario: 'approve' })
  })

  it.each([
    ['Recusar o pagamento', 'decline'],
    ['Deixar em análise', 'delay'],
  ])('escolher "%s" envia o cenário "%s"', async (label, scenario) => {
    const { payCalls } = stubApi([])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await screen.findByRole('radio', { name: label }))
    await user.click(await payButton())

    await waitFor(() => expect(payCalls).toHaveLength(1))
    expect(payCalls[0]?.body).toEqual({ scenario })
  })

  it('enquanto envia, o botão fica desabilitado e diz "Pagando…"', async () => {
    const reply = deferred()
    stubApi([reply.promise])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())

    expect(await screen.findByRole('button', { name: 'Pagando…' })).toBeDisabled()
    reply.resolve(jsonResponse(approved))
    expect(await payButton()).toBeEnabled()
  })

  it('dois cliques no mesmo instante enviam um só pagamento', async () => {
    const reply = deferred()
    const { payCalls } = stubApi([reply.promise])
    renderPayment()
    const button = await payButton()

    // Os dois cliques chegam antes de a tela ser redesenhada: o disabled ainda não valeu.
    act(() => {
      button.click()
      button.click()
    })

    await waitFor(() => expect(payCalls).toHaveLength(1))
    await act(async () => {}) // dá tempo de um segundo pedido, se existisse, chegar
    expect(payCalls).toHaveLength(1)
    reply.resolve(jsonResponse(approved))
    expect(await payButton()).toBeEnabled()
  })

  it('falha de rede: tentar de novo reaproveita a mesma chave', async () => {
    const { payCalls } = stubApi([offline(), jsonResponse(approved)])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(await payButton())

    await waitFor(() => expect(payCalls).toHaveLength(2))
    expect(payCalls[1]?.key).toMatch(UUID)
    expect(payCalls[1]?.key).toBe(payCalls[0]?.key)
  })

  it('depois de uma recusa (402), a próxima tentativa usa outra chave', async () => {
    const { payCalls } = stubApi([jsonResponse(declined, 402), jsonResponse(approved)])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())
    await waitFor(() => expect(payCalls).toHaveLength(1))
    await user.click(await payButton())

    await waitFor(() => expect(payCalls).toHaveLength(2))
    expect(payCalls[1]?.key).toMatch(UUID)
    expect(payCalls[1]?.key).not.toBe(payCalls[0]?.key)
  })

  it('trocar o cenário depois de uma falha muda o corpo, então a chave também muda', async () => {
    const { payCalls } = stubApi([offline(), jsonResponse(declined, 402)])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Recusar o pagamento' }))
    await user.click(await payButton())

    await waitFor(() => expect(payCalls).toHaveLength(2))
    expect(payCalls[1]?.body).toEqual({ scenario: 'decline' })
    expect(payCalls[1]?.key).not.toBe(payCalls[0]?.key)
  })

  it('erro de regra mostra a mensagem da API e libera o botão', async () => {
    stubApi([
      jsonResponse(
        { code: 'reservation_not_payable', message: 'Esta reserva não pode ser paga.' },
        409,
      ),
    ])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta reserva não pode ser paga.')
    expect(await payButton()).toBeEnabled()
  })

  it('reserva que não está aguardando pagamento não tem Pagar nem modo demonstração', async () => {
    stubApi([], reservationOf({ status: 'paid' }))
    renderPayment()

    await screen.findByText('Esta reserva não está aguardando pagamento.')

    expect(screen.queryByRole('button', { name: 'Pagar' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Modo demonstração' })).toBeNull()
  })
})
