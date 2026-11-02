import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { SeatMap } from '../api/types'
import { controllableFetch, jsonResponse, stubRoutes } from '../test/http'
import { useSeatMap } from './useSeatMap'

function mapOf(tripId: number, status: 'free' | 'held' = 'free'): SeatMap {
  return { trip_id: tripId, capacity: 1, seats: [{ seat_number: 1, status }] }
}

describe('useSeatMap', () => {
  it('começa em loading e pede os assentos da viagem', async () => {
    const { seen } = stubRoutes({ '/api/trips/7/seats': [jsonResponse(mapOf(7))] })
    const { result } = renderHook(() => useSeatMap(7))

    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current.state.status).toBe('success'))
    expect(seen.map((call) => call.url)).toEqual(['/api/trips/7/seats'])
  })

  it('vira success com o mapa de assentos', async () => {
    stubRoutes({ '/api/trips/7/seats': [jsonResponse(mapOf(7))] })
    const { result } = renderHook(() => useSeatMap(7))

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'success', seatMap: mapOf(7) }),
    )
  })

  it('vira error com o código do 404', async () => {
    stubRoutes({
      '/api/trips/9/seats': [
        jsonResponse({ code: 'trip_not_found', message: 'Viagem não encontrada.' }, 404),
      ],
    })
    const { result } = renderHook(() => useSeatMap(9))

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'error',
        error: { code: 'trip_not_found' },
      }),
    )
  })

  it('vira error com network_error quando a rede falha', async () => {
    stubRoutes({})
    const { result } = renderHook(() => useSeatMap(7))

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'error',
        error: { code: 'network_error' },
      }),
    )
  })

  it('reload volta a loading e pede de novo', async () => {
    const { seen } = stubRoutes({
      '/api/trips/7/seats': [jsonResponse(mapOf(7, 'free')), jsonResponse(mapOf(7, 'held'))],
    })
    const { result } = renderHook(() => useSeatMap(7))
    await waitFor(() => expect(result.current.state.status).toBe('success'))

    act(() => result.current.reload())

    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'success', seatMap: mapOf(7, 'held') }),
    )
    expect(seen).toHaveLength(2)
  })

  it('trocar de viagem cancela a primeira e ignora a resposta antiga', async () => {
    const { calls } = controllableFetch()
    const { result, rerender } = renderHook(({ id }) => useSeatMap(id), {
      initialProps: { id: 1 },
    })

    rerender({ id: 2 })

    expect(calls).toHaveLength(2)
    expect(calls[0]?.signal?.aborted).toBe(true)
    await act(async () => {
      calls[1]?.resolve(jsonResponse(mapOf(2)))
      calls[0]?.resolve(jsonResponse(mapOf(1)))
    })
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'success', seatMap: mapOf(2) }),
    )
  })

  it('sair da tela cancela a requisição em andamento', () => {
    const { calls } = controllableFetch()
    const { unmount } = renderHook(() => useSeatMap(7))

    unmount()

    expect(calls[0]?.signal?.aborted).toBe(true)
  })

  it('no StrictMode termina em success, sem ficar preso em loading', async () => {
    stubRoutes({
      '/api/trips/7/seats': [jsonResponse(mapOf(7)), jsonResponse(mapOf(7))],
    })
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
    const { result } = renderHook(() => useSeatMap(7), { wrapper })

    await waitFor(() => expect(result.current.state.status).toBe('success'))
  })
})
