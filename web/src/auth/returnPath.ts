const AUTH_PAGES = ['/entrar', '/criar-conta']

/**
 * Para onde ir depois de entrar: a página que mandou a pessoa ao Entrar (state.from),
 * se for uma página deste site; senão, a busca.
 *
 * O state pode ter qualquer coisa, então nada dele é confiável. Em vez de uma regex
 * própria, o texto passa pelo mesmo interpretador de endereços do navegador (URL) e só
 * vale se continuar no mesmo site: assim "//evil.com", "/\evil.com" e "/<tab>/evil.com"
 * (que o navegador lê como outro site) não viram um redirecionamento para fora.
 */
export function returnPath(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return '/'
  }
  const { from } = state
  if (typeof from !== 'string') {
    return '/'
  }

  let url: URL
  try {
    url = new URL(from, window.location.origin)
  } catch {
    return '/'
  }
  if (url.origin !== window.location.origin || AUTH_PAGES.includes(url.pathname)) {
    return '/'
  }
  return url.pathname + url.search + url.hash
}
