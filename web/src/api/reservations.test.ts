import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { jsonResponse } from '../test/http'
import { listReservations } from './reservations'
import type { Reservation } from './types'

const reservation: Reservation = {
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
}

describe('listReservations', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  it('faz GET em /api/reservations com o token e devolve a lista', async () => {
    tokenStore.set('token-a')
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse([reservation])))
    vi.stubGlobal('fetch', fetchMock)

    await expect(listReservations()).resolves.toEqual([reservation])

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/reservations')
    expect(init?.method).toBeUndefined()
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a')
  })

  it('repassa o AbortSignal para o fetch', async () => {
    tokenStore.set('token-a')
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse([])))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await listReservations(controller.signal)

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it('deixa o ApiRequestError de um erro do servidor passar', async () => {
    tokenStore.set('token-a')
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(jsonResponse({ code: 'internal', message: 'Erro interno.' }, 500)),
      ),
    )

    await expect(listReservations()).rejects.toMatchObject({ status: 500, code: 'internal' })
  })
})
