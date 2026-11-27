import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { Reservation } from '../api/types'
import { controllableFetch, jsonResponse, stubRoutes } from '../test/http'
import { useReservation } from './useReservation'

function reservationOf(id: number, status = 'held'): Reservation {
  return {
    id,
    trip_id: 7,
    seat_number: 12,
    origin_position: 1,
    destination_position: 4,
    status,
    price_cents: 7990,
    expires_at: '2026-11-20T12:10:00Z',
    expires_in_seconds: 540,
    payment_status: null,
  }
}

describe('useReservation', () => {
  it('começa em loading e pede a reserva pelo id', async () => {
    const { seen } = stubRoutes({ '/api/reservations/31': [jsonResponse(reservationOf(31))] })
    const { result } = renderHook(() => useReservation(31))

    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current.state.status).toBe('success'))
    expect(seen.map((call) => call.url)).toEqual(['/api/reservations/31'])
  })

  it('vira success com a reserva', async () => {
    stubRoutes({ '/api/reservations/31': [jsonResponse(reservationOf(31))] })
    const { result } = renderHook(() => useReservation(31))

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'success', reservation: reservationOf(31) }),
    )
  })

  it('vira error com o código do 404', async () => {
    stubRoutes({
      '/api/reservations/99': [
        jsonResponse({ code: 'reservation_not_found', message: 'Reserva não encontrada.' }, 404),
      ],
    })
    const { result } = renderHook(() => useReservation(99))

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'error',
        error: { code: 'reservation_not_found' },
      }),
    )
  })

  it('vira error com network_error quando a rede falha', async () => {
    stubRoutes({})
    const { result } = renderHook(() => useReservation(31))

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'error',
        error: { code: 'network_error' },
      }),
    )
  })

  it('reload volta a loading e pede de novo', async () => {
    const { seen } = stubRoutes({
      '/api/reservations/31': [
        jsonResponse(reservationOf(31, 'held')),
        jsonResponse(reservationOf(31, 'paid')),
      ],
    })
    const { result } = renderHook(() => useReservation(31))
    await waitFor(() => expect(result.current.state.status).toBe('success'))

    act(() => result.current.reload())

    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'success',
        reservation: reservationOf(31, 'paid'),
      }),
    )
    expect(seen).toHaveLength(2)
  })

  it('trocar de reserva cancela o primeiro pedido e ignora a resposta antiga', async () => {
    const { calls } = controllableFetch()
    const { result, rerender } = renderHook(({ id }) => useReservation(id), {
      initialProps: { id: 1 },
    })

    rerender({ id: 2 })

    expect(calls).toHaveLength(2)
    expect(calls[0]?.signal?.aborted).toBe(true)
    await act(async () => {
      calls[1]?.resolve(jsonResponse(reservationOf(2)))
      calls[0]?.resolve(jsonResponse(reservationOf(1)))
    })
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'success', reservation: reservationOf(2) }),
    )
  })

  it('sair da tela cancela o pedido em andamento', () => {
    const { calls } = controllableFetch()
    const { unmount } = renderHook(() => useReservation(31))

    unmount()

    expect(calls[0]?.signal?.aborted).toBe(true)
  })

  it('no StrictMode termina em success, sem ficar preso em loading', async () => {
    stubRoutes({
      '/api/reservations/31': [jsonResponse(reservationOf(31)), jsonResponse(reservationOf(31))],
    })
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
    const { result } = renderHook(() => useReservation(31), { wrapper })

    await waitFor(() => expect(result.current.state.status).toBe('success'))
  })
})
