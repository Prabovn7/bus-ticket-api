import { useCallback, useEffect, useState } from 'react'
import { readStoredTheme, saveTheme, type Theme } from './storage'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'escuro' : 'claro'
}

export function useTheme(): { effective: Theme; toggle: () => void } {
  const [choice, setChoice] = useState<Theme | null>(() => readStoredTheme())
  const [system, setSystem] = useState<Theme>(() => systemTheme())

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      setSystem(event.matches ? 'escuro' : 'claro')
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const effective = choice ?? system

  useEffect(() => {
    document.documentElement.dataset.tema = effective
  }, [effective])

  const toggle = useCallback(() => {
    const next: Theme = effective === 'escuro' ? 'claro' : 'escuro'
    setChoice(next)
    saveTheme(next)
  }, [effective])

  return { effective, toggle }
}
