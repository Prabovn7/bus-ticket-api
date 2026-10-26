import { useMediaQuery } from './useMediaQuery'

/** `true` quando o sistema pede movimento reduzido; muda sozinho se a configuração mudar. */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
