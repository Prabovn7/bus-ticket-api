import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Hold, Seat, SeatMap, User } from '../api/types'
import type { AuthContextValue } from '../auth/authContext'
import { routes } from '../router'
import { authWrapper, fakeAuth } from '../test/auth'
import { jsonResponse } from '../test/http'

const SEAT = 7
const ME: User = { id: 1, email: 'ana@exemplo.com', name: 'Ana' }
const LOGGED_IN = fakeAuth({ status: 'authenticated', user: ME })

function mapOf(heldSeat?: number): Response {
  const seats: Seat[] = Array.from({ length: 40 }, (_, index) => ({
    seat_number: index + 1,
    status: index + 1 === heldSeat ? 'held' : 'free',
  }))
  const body: SeatMap = { trip_id: 7, capacity: 40, seats }
  return jsonResponse(body)
}

function holdResponse(seconds = 600): Response {
  const body: Hold = {
    id: 31,
    trip_id: 7,
    seat_number: SEAT,
    origin_position: 1,
    destination_position: 4,
    status: 'held',
    price_cents: 7990,
    expires_at: '2026-11-20T12:10:00Z',
    expires_in_seconds: seconds,
  }
  return jsonResponse(body, 201)
}

const SEAT_TAKEN = { code: 'seat_unavailable', message: 'Assento indisponível.' }

interface Script {
  seats: Response[]
  holds?: (Response | Promise<Response>)[]
  refresh?: Response[]
}

/** Responde a cada endpoint na ordem do roteiro e anota os pedidos de reserva. */
function stubApi(script: Script) {
  const seats = [...script.seats]
  const holds = [...(script.holds ?? [])]
  const refresh = [...(script.refresh ?? [])]
  const holdCalls: { body: unknown; signal: AbortSignal | null | undefined }[] = []
  let seatCalls = 0

  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = String(input)
    if (url === '/api/trips/7/seats') {
      seatCalls += 1
      return Promise.resolve(seats.shift() ?? mapOf())
    }
    if (url === '/api/trips/7/holds') {
      holdCalls.push({ body: JSON.parse(String(init?.body)), signal: init?.signal })
      return Promise.resolve(holds.shift() ?? holdResponse())
    }
    if (url === '/api/auth/refresh') {
      return Promise.resolve(refresh.shift() ?? jsonResponse({ code: 'no_session' }, 401))
    }
    return Promise.reject(new Error(`Chamada inesperada: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { holdCalls, seatCalls: () => seatCalls }
}

function renderAt(path: string, auth: AuthContextValue = LOGGED_IN) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />, { wrapper: authWrapper(auth) })
  return { router, ...view }
}

const radio = (name: string) => screen.findByRole('radio', { name })

async function pickSeat(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await radio(`Assento ${SEAT}, livre`))
}

describe('TripPage: reservar o assento', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sem assento escolhido, não há botão de reservar', async () => {
    stubApi({ seats: [mapOf()] })
    renderAt('/viagens/7')

    await screen.findByRole('group', { name: 'Escolha seu assento' })

    expect(screen.queryByRole('button', { name: /reservar/i })).toBeNull()
  })

  it('com o assento escolhido e a pessoa logada, oferece "Reservar assento 7"', async () => {
    stubApi({ seats: [mapOf()] })
    const user = userEvent.setup()
    renderAt('/viagens/7')

    await pickSeat(user)

    expect(screen.getByRole('button', { name: 'Reservar assento 7' })).toBeEnabled()
  })

  it('reservar pede o hold do assento escolhido e troca a grade pelo painel com o tempo', async () => {
    const { holdCalls } = stubApi({ seats: [mapOf()], holds: [holdResponse()] })
    const user = userEvent.setup()
    renderAt('/viagens/7')
    await pickSeat(user)

    await user.click(screen.getByRole('button', { name: 'Reservar assento 7' }))

    expect(await screen.findByText('Assento 7 reservado para você.')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('10:00')
    expect(holdCalls.map((call) => call.body)).toEqual([{ seat_number: SEAT }])
    expect(screen.queryByRole('group', { name: 'Escolha seu assento' })).toBeNull()
    expect(screen.queryByRole('button', { name: /reservar assento/i })).toBeNull()
  })

  it('o tempo desce e, ao chegar a zero, a reserva expira e a escolha recomeça', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const { seatCalls } = stubApi({ seats: [mapOf(), mapOf()], holds: [holdResponse()] })
    const user = userEvent.setup()
    renderAt('/viagens/7')
    await pickSeat(user)
    await user.click(screen.getByRole('button', { name: 'Reservar assento 7' }))
    await screen.findByRole('timer')

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByRole('timer')).toHaveTextContent('09:00')

    act(() => {
      vi.advanceTimersByTime(540_000)
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Sua reserva expirou.')
    expect(screen.queryByRole('timer')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Escolher outro assento' }))

    expect(await screen.findByRole('group', { name: 'Escolha seu assento' })).toBeInTheDocument()
    expect(screen.getByText('Nenhum assento selecionado.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(seatCalls()).toBe(2)
  })

  it('assento tomado (409): avisa, zera a escolha e recarrega os assentos', async () => {
    const { seatCalls } = stubApi({
      seats: [mapOf(), mapOf(SEAT)],
      holds: [jsonResponse(SEAT_TAKEN, 409)],
    })
    const user = userEvent.setup()
    renderAt('/viagens/7')
    await pickSeat(user)

    await user.click(screen.getByRole('button', { name: 'Reservar assento 7' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esse assento acabou de ser reservado por outra pessoa. Escolha outro.',
    )
    expect(await radio('Assento 7, reservado por outra pessoa')).toBeDisabled()
    expect(screen.getByText('Nenhum assento selecionado.')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
    expect(seatCalls()).toBe(2)
  })

  it('outro erro da API: mostra a mensagem, mantém a escolha e deixa tentar de novo', async () => {
    const { seatCalls } = stubApi({
      seats: [mapOf()],
      holds: [
        jsonResponse({ code: 'invalid_seat', message: 'Assento inválido.' }, 422),
        holdResponse(),
      ],
    })
    const user = userEvent.setup()
    renderAt('/viagens/7')
    await pickSeat(user)

    await user.click(screen.getByRole('button', { name: 'Reservar assento 7' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Assento inválido.')
    expect(await radio('Assento 7, livre')).toBeChecked()
    expect(seatCalls()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Reservar assento 7' }))

    expect(await screen.findByText('Assento 7 reservado para você.')).toBeInTheDocument()
  })

  it('escolher outro assento limpa o aviso de erro', async () => {
    stubApi({
      seats: [mapOf()],
      holds: [jsonResponse({ code: 'invalid_seat', message: 'Assento inválido.' }, 422)],
    })
    const user = userEvent.setup()
    renderAt('/viagens/7')
    await pickSeat(user)
    await user.click(screen.getByRole('button', { name: 'Reservar assento 7' }))
    await screen.findByRole('alert')

    await user.click(await radio('Assento 8, livre'))

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sessão vencida (401 e a renovação também falha): leva ao Entrar e guarda a página', async () => {
    stubApi({
      seats: [mapOf()],
      holds: [jsonResponse({ code: 'not_authenticated', message: 'Faça login.' }, 401)],
    })
    const user = userEvent.setup()
    const { router } = renderAt('/viagens/7')
    await pickSeat(user)

    await user.click(screen.getByRole('button', { name: 'Reservar assento 7' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/entrar')
    expect(router.state.location.state).toEqual({ from: '/viagens/7' })
  })

  it('sem login, o botão pede para entrar e leva ao Entrar sem chamar a reserva', async () => {
    const { holdCalls } = stubApi({ seats: [mapOf()] })
    const user = userEvent.setup()
    const { router } = renderAt('/viagens/7', fakeAuth())
    await pickSeat(user)

    await user.click(screen.getByRole('button', { name: 'Entrar para reservar o assento 7' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ from: '/viagens/7' })
    expect(holdCalls).toHaveLength(0)
  })

  it('enquanto a sessão carrega, o botão fica desabilitado', async () => {
    stubApi({ seats: [mapOf()] })
    const user = userEvent.setup()
    renderAt('/viagens/7', fakeAuth({ status: 'loading' }))

    await pickSeat(user)

    expect(screen.getByRole('button', { name: 'Reservar assento 7' })).toBeDisabled()
  })

  it('dois cliques seguidos fazem um pedido só, e o botão fica desabilitado até a resposta', async () => {
    let answer!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      answer = resolve
    })
    const { holdCalls } = stubApi({ seats: [mapOf()], holds: [pending] })
    const user = userEvent.setup()
    renderAt('/viagens/7')
    await pickSeat(user)
    const button = screen.getByRole('button', { name: 'Reservar assento 7' })

    await user.dblClick(button)

    expect(holdCalls).toHaveLength(1)
    expect(button).toBeDisabled()

    answer(holdResponse())
    expect(await screen.findByText('Assento 7 reservado para você.')).toBeInTheDocument()
  })

  it('sair da página durante a reserva cancela o pedido', async () => {
    const pending = new Promise<Response>(() => {})
    const { holdCalls } = stubApi({ seats: [mapOf()], holds: [pending] })
    const user = userEvent.setup()
    const { unmount } = renderAt('/viagens/7')
    await pickSeat(user)
    await user.click(screen.getByRole('button', { name: 'Reservar assento 7' }))
    expect(holdCalls[0]?.signal?.aborted).toBe(false)

    unmount()

    expect(holdCalls[0]?.signal?.aborted).toBe(true)
  })
})
