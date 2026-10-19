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
