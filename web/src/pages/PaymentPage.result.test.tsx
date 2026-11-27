import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { jsonResponse } from '../test/http'
import {
  approved,
  declined,
  payButton,
  pending,
  renderPayment,
  reservationOf,
  stubPaymentApi,
} from '../test/payment'

describe('PaymentPage: resultado do pagamento', () => {
  it('aprovado: mostra "Viagem confirmada" e tira o pagamento da tela', async () => {
    stubPaymentApi([jsonResponse(approved)])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Viagem confirmada' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Pagamento aprovado.')
    expect(screen.getByText('Assento: 12')).toBeInTheDocument()
    expect(screen.getByText(/^Valor:/)).toHaveTextContent(/^Valor: R\$\s79,90$/)
    expect(screen.queryByRole('button', { name: 'Pagar' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Modo demonstração' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Pix simulado' })).toBeNull()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('recusado: avisa, mantém a reserva e deixa tentar de novo', async () => {
    stubPaymentApi([jsonResponse(declined, 402)])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())

    expect(await screen.findByRole('status')).toHaveTextContent('Pagamento recusado.')
    expect(await payButton()).toBeEnabled()
    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Viagem confirmada' })).toBeNull()
  })

  it('em análise: troca Pagar por "Atualizar situação" e não deixa pagar de novo', async () => {
    stubPaymentApi([jsonResponse(pending, 202)])
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())

    expect(await screen.findByRole('status')).toHaveTextContent('Pagamento em análise.')
    expect(screen.getByRole('button', { name: 'Atualizar situação' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Pagar' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Modo demonstração' })).toBeNull()
  })

  it('em análise: "Atualizar situação" lê a reserva de novo e mostra a viagem confirmada', async () => {
    const { reads } = stubPaymentApi(
      [jsonResponse(pending, 202)],
      [reservationOf(), reservationOf({ status: 'paid' })],
    )
    const user = userEvent.setup()
    renderPayment()

    await user.click(await payButton())
    await user.click(await screen.findByRole('button', { name: 'Atualizar situação' }))

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Viagem confirmada' }),
    ).toBeInTheDocument()
    expect(reads()).toBe(2)
  })

  it.each([
    ['hold_expired', 410, 'O prazo da reserva acabou.'],
    ['seat_lost', 409, 'O assento não está mais reservado para você.'],
  ])(
    '%s (%i): mostra a mensagem da API e leva a escolher outro assento',
    async (code, status, message) => {
      stubPaymentApi([jsonResponse({ code, message }, status)])
      const user = userEvent.setup()
      renderPayment()

      await user.click(await payButton())

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.getByRole('link', { name: 'Escolher outro assento' })).toHaveAttribute(
        'href',
        '/viagens/7',
      )
      expect(screen.queryByRole('button', { name: 'Pagar' })).toBeNull()
    },
  )
})
