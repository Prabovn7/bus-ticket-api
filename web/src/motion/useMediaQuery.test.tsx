import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockMediaQueries, mockMotionPreference } from '../test/motion'
import { useMediaQuery } from './useMediaQuery'

describe('useMediaQuery', () => {
  it('devolve false quando a consulta não casa', () => {
    const { result } = renderHook(() => useMediaQuery('(hover: none)'))
    expect(result.current).toBe(false)
  })

  it('consulta cada pergunta de forma independente', () => {
    const matchMedia = mockMediaQueries({ '(hover: none)': true })

    const noHover = renderHook(() => useMediaQuery('(hover: none)'))
    const reduced = renderHook(() => useMediaQuery('(prefers-reduced-motion: reduce)'))

    expect(noHover.result.current).toBe(true)
    expect(reduced.result.current).toBe(false)
    expect(matchMedia).toHaveBeenCalledWith('(hover: none)')
  })

  it('acompanha a mudança enquanto a página está aberta', () => {
    const motion = mockMotionPreference(false)
    const { result } = renderHook(() => useMediaQuery('(hover: none)'))
    expect(result.current).toBe(false)

    act(() => motion.change(true))

    expect(result.current).toBe(true)
  })
})
