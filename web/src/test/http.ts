import { vi } from 'vitest'

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Troca o fetch por uma versão que obedece ao AbortSignal, como o de verdade. */
export function controllableFetch() {
  const calls: {
    signal: AbortSignal | undefined
    resolve: (response: Response) => void
  }[] = []

  const fetchMock = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal ?? undefined
        calls.push({ signal, resolve })
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      }),
  )

  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls }
}

/** Responde por URL, na ordem de cada fila, e anota a URL e o cabeçalho Authorization enviados. */
export function stubRoutes(routes: Record<string, Response[]>) {
  const queues = new Map(Object.entries(routes).map(([url, list]) => [url, [...list]]))
  const seen: { url: string; auth: string | null }[] = []

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    seen.push({ url, auth: new Headers(init?.headers).get('Authorization') })
    const next = queues.get(url)?.shift()
    return next ? Promise.resolve(next) : Promise.reject(new Error(`Chamada inesperada: ${url}`))
  })

  vi.stubGlobal('fetch', fetchMock)
  return { seen }
}
