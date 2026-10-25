import { useEffect, useRef } from 'react'
import { useLocation, useMatches } from 'react-router'

const SITE_NAME = 'Ônibora'

function titleFrom(handle: unknown): string | null {
  if (typeof handle === 'object' && handle !== null && 'title' in handle) {
    return typeof handle.title === 'string' ? handle.title : null
  }
  return null
}

function currentTitle(matches: ReturnType<typeof useMatches>): string | null {
  // A rota mais funda vence: percorre da folha para a raiz.
  for (const match of [...matches].reverse()) {
    const title = titleFrom(match.handle)
    if (title) {
      return title
    }
  }
  return null
}

/** Título da aba por rota e foco no h1 quando a rota muda (não no primeiro carregamento). */
export function usePageAnnouncement() {
  const { pathname } = useLocation()
  const title = currentTitle(useMatches())
  // Compara com o caminho anterior em vez de "primeira vez": o StrictMode roda o efeito duas vezes.
  const previousPath = useRef(pathname)

  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME
  }, [title])

  useEffect(() => {
    if (previousPath.current === pathname) {
      return
    }
    previousPath.current = pathname
    const heading = document.querySelector<HTMLElement>('main h1')
    if (heading) {
      // Sem tabindex o h1 não recebe foco por código; -1 não o coloca na ordem do Tab.
      heading.tabIndex = -1
      heading.focus()
    }
  }, [pathname])
}
