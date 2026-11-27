import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { jsonResponse } from '../test/http'
import {
  approved,
  declined,
  deferred,
  offline,
  payButton,
  renderPayment,
  reservationOf,
  stubPaymentApi,
} from '../test/payment'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('PaymentPage: pagar', () => {
  it('mostra o botão Pagar e o modo demonstração, com a aprovação marcada', async () => {
    stubPaymentApi([])
    renderPayment()

    expect(await payButton()).toBeEnabled()
    const group = screen.getByRole('group', { name: 'Modo demonstração' })
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Aprovar o pagamento' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Recusar o pagamento' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Deixar em análise' })).not.toBeChecked()
  })

  it('Pagar envia o POST com a chave de idempotência e o cenário "approve"', async () => {
    const { payCalls } = stubPaymentApi([])
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
    const { payCalls } = stubPaymentApi([])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await screen.findByRole('radio', { name: label }))
    await user.click(await payButton())

    await waitFor(() => expect(payCalls).toHaveLength(1))
    expect(payCalls[0]?.body).toEqual({ scenario })
  })

  it('enquanto envia, o botão fica desabilitado e diz "Pagando…"', async () => {
    const reply = deferred()
    stubPaymentApi([reply.promise])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())

    expect(await screen.findByRole('button', { name: 'Pagando…' })).toBeDisabled()
    reply.resolve(jsonResponse(declined, 402))
    expect(await payButton()).toBeEnabled()
  })

  it('dois cliques no mesmo instante enviam um só pagamento', async () => {
    const reply = deferred()
    const { payCalls } = stubPaymentApi([reply.promise])
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
    reply.resolve(jsonResponse(declined, 402))
    expect(await payButton()).toBeEnabled()
  })

  it('falha de rede: tentar de novo reaproveita a mesma chave', async () => {
    const { payCalls } = stubPaymentApi([offline(), jsonResponse(approved)])
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
    const { payCalls } = stubPaymentApi([jsonResponse(declined, 402), jsonResponse(approved)])
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
    const { payCalls } = stubPaymentApi([offline(), jsonResponse(declined, 402)])
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
    stubPaymentApi([
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
    stubPaymentApi([], reservationOf({ status: 'paid' }))
    renderPayment()

    await screen.findByText('Esta reserva não está aguardando pagamento.')

    expect(screen.queryByRole('button', { name: 'Pagar' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Modo demonstração' })).toBeNull()
  })
})
