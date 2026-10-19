import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TripResult } from '../api/types'
import { controllableFetch, jsonResponse } from '../test/http'
import { useSearchTrips } from './useSearchTrips'

const oldTrip: TripResult = {
  trip_id: 1,
  departure_at: '2026-10-19T11:00:00Z',
  arrival_at: '2026-10-19T17:30:00Z',
  price_cents: 14500,
  capacity: 40,
}
const newTrip: TripResult = { ...oldTrip, trip_id: 2, price_cents: 9000 }

function stubFetchWith(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fetchMock)
}

async function runSearch(result: { current: ReturnType<typeof useSearchTrips> }) {
  await act(async () => {
    await result.current.search(1, 4, '2026-10-19')
  })
}

describe('useSearchTrips', () => {
  it('começa em idle', () => {
    const { result } = renderHook(() => useSearchTrips())
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('mostra loading enquanto espera a resposta', () => {
    controllableFetch()
    const { result } = renderHook(() => useSearchTrips())
    act(() => {
      void result.current.search(1, 4, '2026-10-19')
    })
    expect(result.current.state).toEqual({ status: 'loading' })
  })

  it('vira success com as viagens', async () => {
    stubFetchWith(jsonResponse([oldTrip]))
    const { result } = renderHook(() => useSearchTrips())
    await runSearch(result)
    expect(result.current.state).toEqual({
      status: 'success',
      trips: [oldTrip],
    })
  })

  it('vira empty quando a lista vem vazia', async () => {
    stubFetchWith(jsonResponse([]))
    const { result } = renderHook(() => useSearchTrips())
    await runSearch(result)
    expect(result.current.state).toEqual({ status: 'empty' })
  })

  it.each([
    [404, { code: 'city_not_found', message: 'Cidade não encontrada.' }, 'city_not_found'],
    [422, { code: 'invalid_search', message: 'Escolha cidades diferentes.' }, 'invalid_search'],
    [422, { detail: [{ msg: 'x' }] }, 'validation_error'],
  ])('vira error com o código certo (HTTP %i)', async (status, body, code) => {
    stubFetchWith(jsonResponse(body, status))
    const { result } = renderHook(() => useSearchTrips())
    await runSearch(result)
    expect(result.current.state).toMatchObject({
      status: 'error',
      error: { code },
    })
  })

  it('vira error com network_error quando a rede falha', async () => {
    stubFetchWith(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useSearchTrips())
    await runSearch(result)
    expect(result.current.state).toMatchObject({
      status: 'error',
      error: { code: 'network_error' },
    })
  })

  it('uma segunda busca cancela a primeira e a resposta antiga é ignorada', async () => {
    const { calls } = controllableFetch()
    const { result } = renderHook(() => useSearchTrips())

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.search(1, 4, '2026-10-19')
    })
    act(() => {
      second = result.current.search(4, 1, '2026-10-19')
    })

    expect(calls[0].signal?.aborted).toBe(true)
    expect(calls[1].signal?.aborted).toBe(false)

    await act(async () => {
      await first
    })
    // O cancelamento da primeira não pode virar estado de erro.
    expect(result.current.state).toEqual({ status: 'loading' })

    await act(async () => {
      calls[1].resolve(jsonResponse([newTrip]))
      await second
    })
    expect(result.current.state).toEqual({
      status: 'success',
      trips: [newTrip],
    })
  })

  it('cancela a busca em andamento quando o componente sai da tela', () => {
    const { calls } = controllableFetch()
    const { result, unmount } = renderHook(() => useSearchTrips())
    act(() => {
      void result.current.search(1, 4, '2026-10-19')
    })
    unmount()
    expect(calls[0].signal?.aborted).toBe(true)
  })
})
