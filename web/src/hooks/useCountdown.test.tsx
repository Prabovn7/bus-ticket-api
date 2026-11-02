import { act, renderHook } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hold } from '../api/types'
import { useCountdown } from './useCountdown'

function holdOf(seconds: number, id = 1): Hold {
  return {
    id,
    trip_id: 7,
    seat_number: 12,
    origin_position: 1,
    destination_position: 4,
    status: 'held',
    price_cents: 7990,
    expires_at: '2026-11-20T12:10:00Z',
    expires_in_seconds: seconds,
  }
}

function pass(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sem reserva devolve null e não cria timer', () => {
    const { result } = renderHook(() => useCountdown(null))

    expect(result.current).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('começa com os segundos que o servidor mandou, já na primeira renderização', () => {
    const hold = holdOf(600)
    const { result } = renderHook(() => useCountdown(hold))

    expect(result.current).toBe(600)
  })

  it('desce com o tempo que passa', () => {
    const hold = holdOf(600)
    const { result } = renderHook(() => useCountdown(hold))

    pass(1000)
    expect(result.current).toBe(599)

    pass(60_000)
    expect(result.current).toBe(539)
  })

  it('arredonda para cima: só chega a 0 quando o tempo acabou de verdade', () => {
    const hold = holdOf(600)
    const { result } = renderHook(() => useCountdown(hold))

    pass(1500)
    expect(result.current).toBe(599)

    pass(598_400)
    expect(result.current).toBe(1)

    pass(100)
    expect(result.current).toBe(0)
  })

  it('nunca fica abaixo de 0 e para de contar ao chegar lá', () => {
    const hold = holdOf(5)
    const { result } = renderHook(() => useCountdown(hold))

    pass(60_000)

    expect(result.current).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('não depende do relógio do sistema: mudar a hora do computador não muda a contagem', () => {
    const hold = holdOf(600)
    const { result } = renderHook(() => useCountdown(hold))

    vi.setSystemTime(Date.now() + 3_600_000)
    pass(1000)

    expect(result.current).toBe(599)
  })

  it('só renderiza de novo quando o número muda, não a cada tique', () => {
    const hold = holdOf(600)
    let renders = 0
    renderHook(() => {
      renders += 1
      return useCountdown(hold)
    })

    for (let tick = 0; tick < 16; tick += 1) {
      pass(250) // um act por tique, senão o React junta tudo numa renderização só
    }

    expect(renders).toBeLessThan(14) // sem a comparação seriam 17: uma por tique
  })

  it('uma reserva nova, mesmo com os mesmos segundos, volta ao valor cheio na hora', () => {
    const { result, rerender } = renderHook(({ hold }) => useCountdown(hold), {
      initialProps: { hold: holdOf(600, 1) },
    })
    pass(120_000)
    expect(result.current).toBe(480)

    rerender({ hold: holdOf(600, 2) })

    expect(result.current).toBe(600)
    pass(1000)
    expect(result.current).toBe(599)
  })

  it('ao perder a reserva volta a null e limpa o timer', () => {
    const { result, rerender } = renderHook(({ hold }) => useCountdown(hold), {
      initialProps: { hold: holdOf(600) as Hold | null },
    })

    rerender({ hold: null })

    expect(result.current).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ao desmontar, limpa o timer', () => {
    const hold = holdOf(600)
    const { unmount } = renderHook(() => useCountdown(hold))
    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('no StrictMode conta certo e deixa um timer só', () => {
    const hold = holdOf(600)
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
    const { result } = renderHook(() => useCountdown(hold), { wrapper })

    pass(1000)

    expect(result.current).toBe(599)
    expect(vi.getTimerCount()).toBe(1)
  })
})
