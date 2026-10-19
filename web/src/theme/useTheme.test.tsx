import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTheme } from './useTheme'

function mockSystemDark() {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
}

describe('useTheme', () => {
  it('sem escolha salva, segue o sistema claro', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.effective).toBe('claro')
    expect(document.documentElement.dataset.tema).toBe('claro')
  })

  it('sem escolha salva, segue o sistema escuro', () => {
    mockSystemDark()
    const { result } = renderHook(() => useTheme())
    expect(result.current.effective).toBe('escuro')
    expect(document.documentElement.dataset.tema).toBe('escuro')
  })

  it('a escolha salva vale mais que o sistema', () => {
    localStorage.setItem('tema', 'escuro')
    const { result } = renderHook(() => useTheme())
    expect(result.current.effective).toBe('escuro')
  })

  it('ignora um valor inválido salvo', () => {
    localStorage.setItem('tema', 'roxo')
    const { result } = renderHook(() => useTheme())
    expect(result.current.effective).toBe('claro')
  })

  it('toggle alterna o tema, atualiza o html e grava a escolha', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggle())
    expect(result.current.effective).toBe('escuro')
    expect(document.documentElement.dataset.tema).toBe('escuro')
    expect(localStorage.getItem('tema')).toBe('escuro')
  })

  it('localStorage que lança erro não quebra o hook', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const { result } = renderHook(() => useTheme())
    expect(result.current.effective).toBe('claro')
    act(() => result.current.toggle())
    expect(result.current.effective).toBe('escuro')
  })
})
