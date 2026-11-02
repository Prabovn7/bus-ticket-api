import { renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { TripResult } from '../api/types'
import { controllableFetch, jsonResponse, stubRoutes } from '../test/http'
import { useFreeSeats } from './useFreeSeats'

function tripsOf(...ids: number[]): TripResult[] {
  return ids.map((trip_id) => ({
    trip_id,
    departure_at: '2026-10-20T11:00:00Z',
    arrival_at: '2026-10-20T17:30:00Z',
    price_cents: 14500,
    capacity: 40,
  }))
}

const row = (trip_id: number, free: number) => ({ trip_id, capacity: 40, free })

const URL_1_2 = '/api/trips/availability?trip_ids=1&trip_ids=2'

describe('useFreeSeats', () => {
  it.each([
    ['sem lista (null)', null],
    ['lista vazia', []],
  ])('com %s não faz pedido nenhum', (_label, trips) => {
    const { seen } = stubRoutes({})
    const { result } = renderHook(() => useFreeSeats(trips))

    expect(result.current).toBeNull()
    expect(seen).toHaveLength(0)
  })

  it('pede a disponibilidade das viagens e devolve os livres por viagem', async () => {
    const { seen } = stubRoutes({ [URL_1_2]: [jsonResponse([row(1, 37), row(2, 1)])] })
    const trips = tripsOf(1, 2)
    const { result } = renderHook(() => useFreeSeats(trips))

    await waitFor(() => expect(result.current).not.toBeNull())

    expect(result.current?.get(1)).toBe(37)
    expect(result.current?.get(2)).toBe(1)
    expect(seen.map((call) => call.url)).toEqual([URL_1_2])
  })

  it('é null enquanto espera a resposta', () => {
    controllableFetch()
    const trips = tripsOf(1, 2)
    const { result } = renderHook(() => useFreeSeats(trips))

    expect(result.current).toBeNull()
  })

  it.each([
    ['erro do servidor', () => stubRoutes({ [URL_1_2]: [jsonResponse({ oops: true }, 500)] })],
    ['falha de rede', () => stubRoutes({})],
  ])('com %s devolve um mapa vazio, sem lançar erro', async (_label, arrange) => {
    arrange()
    const trips = tripsOf(1, 2)
    const { result } = renderHook(() => useFreeSeats(trips))

    await waitFor(() => expect(result.current).not.toBeNull())

    expect(result.current?.size).toBe(0)
  })

  it('uma lista nova, mesmo com os mesmos ids, pede de novo e volta a null até chegar', async () => {
    const { seen } = stubRoutes({
      [URL_1_2]: [jsonResponse([row(1, 37), row(2, 1)]), jsonResponse([row(1, 30), row(2, 0)])],
    })
    const { result, rerender } = renderHook(({ trips }) => useFreeSeats(trips), {
      initialProps: { trips: tripsOf(1, 2) },
    })
    await waitFor(() => expect(result.current?.get(1)).toBe(37))

    rerender({ trips: tripsOf(1, 2) })

    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current?.get(1)).toBe(30))
    expect(result.current?.get(2)).toBe(0)
    expect(seen).toHaveLength(2)
  })

  it('re-renderizar com a mesma lista não pede de novo', async () => {
    const { seen } = stubRoutes({ [URL_1_2]: [jsonResponse([row(1, 37), row(2, 1)])] })
    const trips = tripsOf(1, 2)
    const { result, rerender } = renderHook(() => useFreeSeats(trips))
    await waitFor(() => expect(result.current).not.toBeNull())

    rerender()

    expect(result.current?.get(1)).toBe(37)
    expect(seen).toHaveLength(1)
  })

  it('cancela o pedido anterior quando chega outra lista', () => {
    const { calls } = controllableFetch()
    const { rerender } = renderHook(({ trips }) => useFreeSeats(trips), {
      initialProps: { trips: tripsOf(1, 2) },
    })

    rerender({ trips: tripsOf(3) })

    expect(calls).toHaveLength(2)
    expect(calls[0]?.signal?.aborted).toBe(true)
    expect(calls[1]?.signal?.aborted).toBe(false)
  })

  it('pede no máximo 50 viagens por vez (o limite da API)', () => {
    const { fetchMock } = controllableFetch()
    const ids = Array.from({ length: 60 }, (_, index) => index + 1)
    renderHook(() => useFreeSeats(tripsOf(...ids)))

    const url = String(fetchMock.mock.calls[0]?.[0])

    expect(url.match(/trip_ids=/g)).toHaveLength(50)
    expect(url).toContain('trip_ids=50')
    expect(url).not.toContain('trip_ids=51')
  })

  it('no StrictMode termina com os livres da viagem', async () => {
    stubRoutes({
      [URL_1_2]: [jsonResponse([row(1, 37), row(2, 1)]), jsonResponse([row(1, 37), row(2, 1)])],
    })
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
    const trips = tripsOf(1, 2)
    const { result } = renderHook(() => useFreeSeats(trips), { wrapper })

    await waitFor(() => expect(result.current?.get(1)).toBe(37))
  })
})
