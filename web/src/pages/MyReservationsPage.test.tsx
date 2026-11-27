import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fakeAuth } from '../test/auth'
import { controllableFetch, jsonResponse } from '../test/http'
import { offline } from '../test/payment'
import {
  cancelledReservation,
  expiredReservation,
  heldReservation,
  itemFor,
  paidReservation,
  renderMyReservations,
  stubMyReservationsApi,
} from '../test/reservations'

const ALL = [heldReservation, paidReservation, cancelledReservation, expiredReservation]

describe('MyReservationsPage', () => {
  it('sem login, manda para o Entrar e guarda de onde a pessoa veio', async () => {
    const api = stubMyReservationsApi([])
    const { router } = renderMyReservations(fakeAuth())

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ from: '/minhas-reservas' })
    expect(api.listReads()).toBe(0)
  })

  it('enquanto a sessão carrega, espera: não manda para o Entrar nem chama a API', () => {
    const api = stubMyReservationsApi([])
    const { router } = renderMyReservations(fakeAuth({ status: 'loading' }))

    expect(screen.getByRole('status')).toHaveTextContent('Carregando reservas')
    expect(router.state.location.pathname).toBe('/minhas-reservas')
    expect(api.listReads()).toBe(0)
  })

  it('tem o título "Minhas reservas" e mostra "Carregando reservas" enquanto espera', () => {
    controllableFetch()
    renderMyReservations()

    expect(screen.getByRole('heading', { level: 1, name: 'Minhas reservas' })).toBeInTheDocument()
    expect(document.title).toBe('Minhas reservas | Ônibora')
    expect(screen.getByRole('status')).toHaveTextContent('Carregando reservas')
  })

  it('mostra cada reserva com assento, viagem, valor e situação, na ordem da API', async () => {
    stubMyReservationsApi([jsonResponse(ALL)])
    renderMyReservations()

    const list = await screen.findByRole('list', { name: 'Suas reservas' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Assento 12')
    expect(items[0]).toHaveTextContent('Viagem 7')
    expect(items[0]).toHaveTextContent(/R\$\s79,90/)
    expect(items[0]).toHaveTextContent('Aguardando pagamento')
    expect(items[1]).toHaveTextContent('Assento 5')
    expect(items[1]).toHaveTextContent(/R\$\s105,00/)
    expect(items[1]).toHaveTextContent('Paga')
    expect(items[2]).toHaveTextContent('Cancelada')
    expect(items[3]).toHaveTextContent('Expirada')
  })

  it('a reserva em espera tem o link Pagar para a página de pagamento', async () => {
    stubMyReservationsApi([jsonResponse(ALL)])
    renderMyReservations()

    const held = await itemFor(12)
    expect(within(held).getByRole('link', { name: 'Pagar' })).toHaveAttribute(
      'href',
      '/reservas/31/pagamento',
    )
    expect(within(await itemFor(5)).queryByRole('link', { name: 'Pagar' })).toBeNull()
  })

  it('só as reservas pagas e em espera têm o botão Cancelar reserva', async () => {
    stubMyReservationsApi([jsonResponse(ALL)])
    renderMyReservations()

    expect(
      within(await itemFor(12)).getByRole('button', { name: 'Cancelar reserva' }),
    ).toBeInTheDocument()
    expect(
      within(await itemFor(5)).getByRole('button', { name: 'Cancelar reserva' }),
    ).toBeInTheDocument()
    expect(within(await itemFor(20)).queryByRole('button', { name: 'Cancelar reserva' })).toBeNull()
    expect(within(await itemFor(3)).queryByRole('button', { name: 'Cancelar reserva' })).toBeNull()
  })

  it('sem reservas, mostra o estado vazio com o link Buscar viagens', async () => {
    stubMyReservationsApi([jsonResponse([])])
    renderMyReservations()

    expect(await screen.findByText('Você ainda não tem reservas.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buscar viagens' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('list', { name: 'Suas reservas' })).toBeNull()
  })

  it('com falha de rede, mostra o erro e "Tentar de novo" busca outra vez', async () => {
    const user = userEvent.setup()
    const api = stubMyReservationsApi([offline(), jsonResponse([heldReservation])])
    renderMyReservations()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
    )
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByText('Assento 12')).toBeInTheDocument()
    expect(api.listReads()).toBe(2)
  })

  it('um erro da API mostra a mensagem, sem botão para tentar de novo', async () => {
    stubMyReservationsApi([jsonResponse({ code: 'internal', message: 'Erro interno.' }, 500)])
    renderMyReservations()

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno.')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })
})
