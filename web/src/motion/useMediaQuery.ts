import { useCallback, useSyncExternalStore } from 'react'

/** `true` quando a consulta de mídia casa; muda sozinho se a configuração mudar. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Sem navegador (renderização no servidor), nenhuma consulta casa.
    () => false,
  )
}
