import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockMotionPreference } from '../test/motion'
import { useReducedMotion } from './useReducedMotion'

describe('useReducedMotion', () => {
  it('sem preferência do sistema, devolve false', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('devolve true quando o sistema pede movimento reduzido', () => {
    const { matchMedia } = mockMotionPreference(true)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })

  it('acompanha a mudança da configuração enquanto a página está aberta', () => {
    const motion = mockMotionPreference(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)

    act(() => motion.change(true))
    expect(result.current).toBe(true)

    act(() => motion.change(false))
    expect(result.current).toBe(false)
  })

  it('remove o ouvinte ao desmontar', () => {
    const { query } = mockMotionPreference(false)
    const { unmount } = renderHook(() => useReducedMotion())
    unmount()
    expect(query.addEventListener.mock.calls.length).toBeGreaterThan(0)
    expect(query.removeEventListener).toHaveBeenCalledTimes(
      query.addEventListener.mock.calls.length,
    )
  })
})
