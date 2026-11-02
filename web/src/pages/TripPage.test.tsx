import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Seat, SeatMap } from '../api/types'
import { routes } from '../router'
import { authWrapper, fakeAuth } from '../test/auth'
import { controllableFetch, jsonResponse, stubRoutes } from '../test/http'

const HELD = 5
const TAKEN = 6

function mapOf(tripId: number): SeatMap {
  const seats: Seat[] = Array.from({ length: 40 }, (_, index) => {
    const seat_number = index + 1
    const status = seat_number === HELD ? 'held' : seat_number === TAKEN ? 'taken' : 'free'
    return { seat_number, status }
  })
  return { trip_id: tripId, capacity: 40, seats }
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />, { wrapper: authWrapper(fakeAuth()) })
  return { router, ...view }
}

const radio = (name: string) => screen.findByRole('radio', { name })

describe('TripPage', () => {
  it('mostra "Carregando assentos" enquanto espera a resposta', () => {
    controllableFetch()
    renderAt('/viagens/7')

    expect(screen.getByRole('status')).toHaveTextContent('Carregando assentos')
  })

  it('pede os assentos da viagem que está na URL e mostra a grade', async () => {
    const { seen } = stubRoutes({ '/api/trips/7/seats': [jsonResponse(mapOf(7))] })
    renderAt('/viagens/7')

    expect(await screen.findByRole('group', { name: 'Escolha seu assento' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(40)
    expect(seen.map((call) => call.url)).toEqual(['/api/trips/7/seats'])
  })

  it('tem o título "Escolher assento" na tela e na aba', async () => {
    stubRoutes({ '/api/trips/7/seats': [jsonResponse(mapOf(7))] })
    renderAt('/viagens/7')

    expect(screen.getByRole('heading', { level: 1, name: 'Escolher assento' })).toBeInTheDocument()
    expect(document.title).toBe('Escolher assento | Ônibora')
    await screen.findByRole('group', { name: 'Escolha seu assento' })
  })

  it('escolher um assento livre o marca e diz qual é', async () => {
    stubRoutes({ '/api/trips/7/seats': [jsonResponse(mapOf(7))] })
    const user = userEvent.setup()
    renderAt('/viagens/7')

    expect(await screen.findByText('Nenhum assento selecionado.')).toBeInTheDocument()
    await user.click(await radio('Assento 7, livre'))

    expect(await radio('Assento 7, livre')).toBeChecked()
    expect(screen.getByText('Assento 7 selecionado.')).toBeInTheDocument()
  })

  it('assento reservado ou ocupado não pode ser escolhido', async () => {
    stubRoutes({ '/api/trips/7/seats': [jsonResponse(mapOf(7))] })
    const user = userEvent.setup()
    renderAt('/viagens/7')

    await user.click(await radio('Assento 5, reservado por outra pessoa'))
    await user.click(await radio('Assento 6, ocupado'))

    expect(screen.getByText('Nenhum assento selecionado.')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
  })

  it('viagem que não existe mostra a mensagem da API, sem botão de tentar de novo', async () => {
    stubRoutes({
      '/api/trips/99/seats': [
        jsonResponse({ code: 'trip_not_found', message: 'Viagem não encontrada.' }, 404),
      ],
    })
    renderAt('/viagens/99')

    expect(await screen.findByRole('alert')).toHaveTextContent('Viagem não encontrada.')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('com falha de rede, "Tentar de novo" pede os assentos outra vez', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        ++calls === 1
          ? Promise.reject(new TypeError('Failed to fetch'))
          : Promise.resolve(jsonResponse(mapOf(7))),
      ),
    )
    const user = userEvent.setup()
    renderAt('/viagens/7')

    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('group', { name: 'Escolha seu assento' })).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  it.each(['abc', '0', '-3', '1.5', '1e3', '12abc'])(
    'o id "%s" não é uma viagem: avisa sem chamar a API',
    (id) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      renderAt(`/viagens/${id}`)

      expect(screen.getByRole('alert')).toHaveTextContent('Viagem não encontrada.')
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('trocar de viagem zera o assento escolhido', async () => {
    stubRoutes({
      '/api/trips/1/seats': [jsonResponse(mapOf(1))],
      '/api/trips/2/seats': [jsonResponse(mapOf(2))],
    })
    const user = userEvent.setup()
    const { router } = renderAt('/viagens/1')

    await user.click(await radio('Assento 7, livre'))
    expect(screen.getByText('Assento 7 selecionado.')).toBeInTheDocument()
    await act(() => router.navigate('/viagens/2'))

    expect(await screen.findByText('Nenhum assento selecionado.')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
  })

  it('tem um link para voltar à busca', async () => {
    stubRoutes({ '/api/trips/7/seats': [jsonResponse(mapOf(7))] })
    renderAt('/viagens/7')

    expect(screen.getByRole('link', { name: 'Voltar à busca' })).toHaveAttribute('href', '/')
    await screen.findByRole('group', { name: 'Escolha seu assento' })
  })
})
