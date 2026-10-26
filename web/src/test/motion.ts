import { vi } from 'vitest'

/** Simula a preferência de movimento do sistema e permite trocá-la no meio do teste. */
export function mockMotionPreference(reduce: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: reduce,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.delete(listener)
    }),
  }
  const matchMedia = vi
    .spyOn(window, 'matchMedia')
    .mockReturnValue(query as unknown as MediaQueryList)

  return {
    query,
    matchMedia,
    change(next: boolean) {
      query.matches = next
      listeners.forEach((listener) => listener())
    },
  }
}

/** Simula várias consultas de mídia de uma vez: `{ '(hover: none)': true }`. As demais dão false. */
export function mockMediaQueries(matches: Record<string, boolean>) {
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: matches[query] ?? false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}
