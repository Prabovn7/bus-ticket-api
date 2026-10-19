import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { City, TripResult } from '../api/types'
import { todayInSaoPaulo } from '../lib/formatting'
import { jsonResponse } from '../test/http'
import SearchPage from './SearchPage'

// Na mesma ordem em que a API devolve (alfabética).
const cities: City[] = [
  { id: 2, name: 'Campinas', uf: 'SP' },
  { id: 3, name: 'Ribeirão Preto', uf: 'SP' },
  { id: 1, name: 'São Paulo', uf: 'SP' },
  { id: 4, name: 'Uberaba', uf: 'MG' },
]

// 08:00 e 14:30 em São Paulo.
const morningTrip: TripResult = {
  trip_id: 1,
  departure_at: '2026-10-20T11:00:00Z',
  arrival_at: '2026-10-20T17:30:00Z',
  price_cents: 14500,
  capacity: 40,
}

// 23:00 de um dia e 05:30 do dia seguinte em São Paulo.
const nightTrip: TripResult = {
  trip_id: 2,
  departure_at: '2026-10-21T02:00:00Z',
  arrival_at: '2026-10-21T08:30:00Z',
  price_cents: 14500,
  capacity: 40,
}

function stubApi(tripsResponse: () => Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/cities') return Promise.resolve(jsonResponse(cities))
    if (url.startsWith('/api/trips')) return tripsResponse()
    return Promise.reject(new Error(`URL inesperada: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function tripCalls(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith('/api/trips'))
}

async function waitForCities() {
  await screen.findAllByRole('option', { name: 'Uberaba (MG)' })
}

async function search(
  user: UserEvent,
  { origin, destination, date }: { origin: string; destination: string; date: string },
) {
  await waitForCities()
  await user.selectOptions(screen.getByLabelText('Origem'), origin)
  await user.selectOptions(screen.getByLabelText('Destino'), destination)
  fireEvent.change(screen.getByLabelText('Data'), { target: { value: date } })
  await user.click(screen.getByRole('button', { name: 'Buscar viagens' }))
}

const saoPauloToUberaba = {
  origin: 'São Paulo (SP)',
  destination: 'Uberaba (MG)',
  date: '2026-10-20',
}

describe('SearchPage', () => {
  it('carrega as cidades nos selects e começa a data em hoje, em São Paulo', async () => {
    stubApi(() => Promise.resolve(jsonResponse([])))
    render(<SearchPage />)
    await waitForCities()
    expect(within(screen.getByLabelText('Origem')).getAllByRole('option')).toHaveLength(4)
    expect(within(screen.getByLabelText('Destino')).getAllByRole('option')).toHaveLength(4)
    expect(screen.getByLabelText('Data')).toHaveValue(todayInSaoPaulo())
  })

  it('mostra as viagens no quadro, com horário, duração, lugares e preço', async () => {
    const fetchMock = stubApi(() => Promise.resolve(jsonResponse([morningTrip, nightTrip])))
    const user = userEvent.setup()
    render(<SearchPage />)
    await search(user, saoPauloToUberaba)

    const table = await screen.findByRole('table')
    expect(table).toHaveAccessibleName(/São Paulo para Uberaba/)
    const board = within(table)
    expect(board.getByText('08:00')).toBeInTheDocument()
    expect(board.getByText('14:30')).toBeInTheDocument()
    expect(board.getAllByText('6h30')).toHaveLength(2)
    expect(board.getAllByText('R$ 145,00')).toHaveLength(2)
    expect(board.getAllByText('40 livres')).toHaveLength(2)

    const list = screen.getByRole('list', { name: 'Viagens disponíveis' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)

    expect(tripCalls(fetchMock)).toEqual(['/api/trips?origin=1&destination=4&date=2026-10-20'])
  })

  it('avisa "no dia seguinte" só na viagem que chega depois da meia-noite', async () => {
    stubApi(() => Promise.resolve(jsonResponse([morningTrip, nightTrip])))
    const user = userEvent.setup()
    render(<SearchPage />)
    await search(user, saoPauloToUberaba)

    const board = within(await screen.findByRole('table'))
    expect(board.getByText('05:30')).toBeInTheDocument()
    expect(board.getAllByText('no dia seguinte')).toHaveLength(1)
  })

  it('sem viagens no dia, mostra atalhos para os dois dias seguintes', async () => {
    const fetchMock = stubApi(() => Promise.resolve(jsonResponse([])))
    const user = userEvent.setup()
    render(<SearchPage />)
    await search(user, saoPauloToUberaba)

    expect(await screen.findByText(/Nenhuma viagem em/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /22 de outubro/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /21 de outubro/ }))

    expect(tripCalls(fetchMock).at(-1)).toBe('/api/trips?origin=1&destination=4&date=2026-10-21')
    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-21')
  })

  it('com cidades iguais, mostra o erro e não chama a API', async () => {
    const fetchMock = stubApi(() => Promise.resolve(jsonResponse([])))
    const user = userEvent.setup()
    render(<SearchPage />)
    await search(user, { ...saoPauloToUberaba, destination: 'São Paulo (SP)' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha cidades diferentes')
    expect(tripCalls(fetchMock)).toHaveLength(0)
  })

  it('mostra a mensagem da API quando a cidade não existe', async () => {
    stubApi(() =>
      Promise.resolve(
        jsonResponse({ code: 'city_not_found', message: 'Cidade não encontrada.' }, 404),
      ),
    )
    const user = userEvent.setup()
    render(<SearchPage />)
    await search(user, saoPauloToUberaba)

    expect(await screen.findByRole('alert')).toHaveTextContent('Cidade não encontrada.')
  })

  it('com falha de rede, oferece "Tentar de novo" e busca outra vez', async () => {
    let attempts = 0
    const fetchMock = stubApi(() => {
      attempts += 1
      return attempts === 1
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(jsonResponse([morningTrip]))
    })
    const user = userEvent.setup()
    render(<SearchPage />)
    await search(user, saoPauloToUberaba)

    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(tripCalls(fetchMock)).toHaveLength(2)
  })

  it('mostra "Buscando viagens" enquanto espera a resposta', async () => {
    stubApi(() => new Promise<Response>(() => {}))
    const user = userEvent.setup()
    render(<SearchPage />)
    await search(user, saoPauloToUberaba)

    expect(await screen.findByText('Buscando viagens')).toBeInTheDocument()
  })

  it('o botão de inverter troca origem e destino', async () => {
    stubApi(() => Promise.resolve(jsonResponse([])))
    const user = userEvent.setup()
    render(<SearchPage />)
    await waitForCities()
    await user.selectOptions(screen.getByLabelText('Origem'), 'São Paulo (SP)')
    await user.selectOptions(screen.getByLabelText('Destino'), 'Uberaba (MG)')

    await user.click(screen.getByRole('button', { name: 'Inverter origem e destino' }))

    expect(screen.getByLabelText('Origem')).toHaveValue('4')
    expect(screen.getByLabelText('Destino')).toHaveValue('1')
  })

  it('se as cidades não carregam, mostra o erro com "Tentar de novo"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    render(<SearchPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o servidor',
    )
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})
