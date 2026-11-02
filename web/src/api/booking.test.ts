import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { jsonResponse, stubRoutes } from '../test/http'
import { createHold, getSeatMap } from './booking'
import type { Hold, SeatMap } from './types'

const seatMap: SeatMap = {
  trip_id: 7,
  capacity: 2,
  seats: [
    { seat_number: 1, status: 'free' },
    { seat_number: 2, status: 'held' },
  ],
}

describe('getSeatMap', () => {
  it('pede os assentos da viagem e devolve o JSON', async () => {
    const { seen } = stubRoutes({ '/api/trips/7/seats': [jsonResponse(seatMap)] })

    expect(await getSeatMap(7)).toEqual(seatMap)
    expect(seen.map((call) => call.url)).toEqual(['/api/trips/7/seats'])
  })

  it('não envia Authorization: a grade é pública', async () => {
    const { seen } = stubRoutes({ '/api/trips/7/seats': [jsonResponse(seatMap)] })

    await getSeatMap(7)

    expect(seen[0]?.auth).toBeNull()
  })

  it('deixa o ApiRequestError do 404 passar', async () => {
    stubRoutes({
      '/api/trips/9/seats': [
        jsonResponse({ code: 'trip_not_found', message: 'Viagem não encontrada.' }, 404),
      ],
    })

    await expect(getSeatMap(9)).rejects.toMatchObject({ status: 404, code: 'trip_not_found' })
  })
})

const hold: Hold = {
  id: 31,
  trip_id: 7,
  seat_number: 12,
  origin_position: 1,
  destination_position: 4,
  status: 'held',
  price_cents: 7990,
  expires_at: '2026-11-20T12:10:00Z',
  expires_in_seconds: 600,
}

describe('createHold', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  it('faz POST em /holds com o assento em JSON e o token, e devolve a reserva', async () => {
    tokenStore.set('token-a')
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(hold, 201)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createHold(7, 12)).resolves.toEqual(hold)

    const [url, init] = fetchMock.mock.calls[0] ?? []
    const headers = new Headers(init?.headers)
    expect(url).toBe('/api/trips/7/holds')
    expect(init?.method).toBe('POST')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Authorization')).toBe('Bearer token-a')
    expect(JSON.parse(String(init?.body))).toEqual({ seat_number: 12 })
  })

  it('repassa o AbortSignal ao fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(hold, 201)))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await createHold(7, 12, controller.signal)

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it('deixa o ApiRequestError do 409 passar, sem tentar renovar a sessão', async () => {
    tokenStore.set('token-a')
    const { seen } = stubRoutes({
      '/api/trips/7/holds': [
        jsonResponse({ code: 'seat_unavailable', message: 'Assento indisponível.' }, 409),
      ],
    })

    await expect(createHold(7, 12)).rejects.toMatchObject({
      status: 409,
      code: 'seat_unavailable',
    })
    expect(seen.map((call) => call.url)).toEqual(['/api/trips/7/holds'])
  })
})
