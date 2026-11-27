import { within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { jsonResponse } from '../test/http'
import { offline } from '../test/payment'
import {
  heldReservation,
  itemFor,
  paidReservation,
  renderMyReservations,
  stubMyReservationsApi,
} from '../test/reservations'

const LIST = [heldReservation, paidReservation]

function cancelled(id: number, refund: string) {
  return jsonResponse({ reservation_id: id, status: 'cancelled', refund_status: refund })
}

describe('MyReservationsPage: cancelar', () => {
  it('Cancelar reserva pede a confirmação na própria linha, com o foco em Voltar', async () => {
    const user = userEvent.setup()
    const api = stubMyReservationsApi([jsonResponse(LIST)])
    renderMyReservations()
    const item = await itemFor(12)

    await user.click(within(item).getByRole('button', { name: 'Cancelar reserva' }))

    expect(within(item).getByText('Cancelar a reserva do assento 12?')).toBeInTheDocument()
    expect(within(item).getByRole('button', { name: 'Confirmar cancelamento' })).toBeEnabled()
    expect(within(item).getByRole('button', { name: 'Voltar' })).toHaveFocus()
    expect(within(item).queryByRole('button', { name: 'Cancelar reserva' })).toBeNull()
    expect(api.cancelCalls).toHaveLength(0)
  })

  it('Voltar fecha a confirmação, devolve o foco e não cancela nada', async () => {
    const user = userEvent.setup()
    const api = stubMyReservationsApi([jsonResponse(LIST)])
    renderMyReservations()
    const item = await itemFor(12)
    await user.click(within(item).getByRole('button', { name: 'Cancelar reserva' }))

    await user.click(within(item).getByRole('button', { name: 'Voltar' }))

    expect(within(item).getByRole('button', { name: 'Cancelar reserva' })).toHaveFocus()
    expect(within(item).queryByRole('button', { name: 'Confirmar cancelamento' })).toBeNull()
    expect(api.cancelCalls).toHaveLength(0)
  })

  it('confirmar faz um POST do cancelamento e a linha passa a Cancelada, sem recarregar a lista', async () => {
    const user = userEvent.setup()
    const api = stubMyReservationsApi([jsonResponse(LIST)], [cancelled(32, 'refunded')])
    renderMyReservations()
    const item = await itemFor(5)
    await user.click(within(item).getByRole('button', { name: 'Cancelar reserva' }))

    await user.click(within(item).getByRole('button', { name: 'Confirmar cancelamento' }))

    expect(await within(item).findByText('Cancelada')).toBeInTheDocument()
    expect(api.cancelCalls).toEqual([{ id: 32, method: 'POST' }])
    expect(api.listReads()).toBe(1)
    expect(within(item).queryByRole('button')).toBeNull()
    expect(within(item).queryByText('Paga')).toBeNull()
  })

  it.each([
    ['refunded', 'Reserva cancelada. Estorno concluído.'],
    ['pending', 'Reserva cancelada. O estorno está em andamento.'],
    ['none', 'Reserva cancelada.'],
  ])('com estorno %s, anuncia "%s"', async (refund, text) => {
    const user = userEvent.setup()
    stubMyReservationsApi([jsonResponse(LIST)], [cancelled(31, refund)])
    renderMyReservations()
    const item = await itemFor(12)
    await user.click(within(item).getByRole('button', { name: 'Cancelar reserva' }))

    await user.click(within(item).getByRole('button', { name: 'Confirmar cancelamento' }))

    expect(await within(item).findByRole('status')).toHaveTextContent(text)
  })

  it('dois cliques seguidos em Confirmar fazem um pedido só, e o botão avisa que está cancelando', async () => {
    const user = userEvent.setup()
    let release: (response: Response) => void = () => {}
    const slow = new Promise<Response>((resolve) => {
      release = resolve
    })
    const api = stubMyReservationsApi([jsonResponse(LIST)], [slow])
    renderMyReservations()
    const item = await itemFor(12)
    await user.click(within(item).getByRole('button', { name: 'Cancelar reserva' }))

    await user.dblClick(within(item).getByRole('button', { name: 'Confirmar cancelamento' }))

    expect(within(item).getByRole('button', { name: 'Cancelando…' })).toBeDisabled()
    expect(api.cancelCalls).toHaveLength(1)
    release(cancelled(31, 'none'))
    expect(await within(item).findByText('Cancelada')).toBeInTheDocument()
    expect(api.cancelCalls).toHaveLength(1)
  })

  it('um 409 mostra a mensagem da API na linha e deixa tentar de novo', async () => {
    const user = userEvent.setup()
    const api = stubMyReservationsApi(
      [jsonResponse(LIST)],
      [jsonResponse({ code: 'trip_already_departed', message: 'A viagem já partiu.' }, 409)],
    )
    renderMyReservations()
    const item = await itemFor(5)
    await user.click(within(item).getByRole('button', { name: 'Cancelar reserva' }))

    await user.click(within(item).getByRole('button', { name: 'Confirmar cancelamento' }))

    expect(await within(item).findByRole('alert')).toHaveTextContent('A viagem já partiu.')
    expect(within(item).getByText('Paga')).toBeInTheDocument()
    expect(within(item).getByRole('button', { name: 'Cancelar reserva' })).toBeEnabled()
    expect(within(item).queryByRole('button', { name: 'Confirmar cancelamento' })).toBeNull()
    expect(api.cancelCalls).toHaveLength(1)
  })

  it('com falha de rede, mostra a mensagem do cliente e a reserva continua como estava', async () => {
    const user = userEvent.setup()
    stubMyReservationsApi([jsonResponse(LIST)], [offline()])
    renderMyReservations()
    const item = await itemFor(12)
    await user.click(within(item).getByRole('button', { name: 'Cancelar reserva' }))

    await user.click(within(item).getByRole('button', { name: 'Confirmar cancelamento' }))

    expect(await within(item).findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
    )
    expect(within(item).getByText('Aguardando pagamento')).toBeInTheDocument()
  })

  it('cancelar uma reserva não mexe nas outras linhas', async () => {
    const user = userEvent.setup()
    stubMyReservationsApi([jsonResponse(LIST)], [cancelled(31, 'none')])
    renderMyReservations()
    const held = await itemFor(12)
    const paid = await itemFor(5)
    await user.click(within(held).getByRole('button', { name: 'Cancelar reserva' }))

    await user.click(within(held).getByRole('button', { name: 'Confirmar cancelamento' }))

    expect(await within(held).findByText('Cancelada')).toBeInTheDocument()
    expect(within(paid).getByText('Paga')).toBeInTheDocument()
    expect(within(paid).getByRole('button', { name: 'Cancelar reserva' })).toBeEnabled()
  })
})
