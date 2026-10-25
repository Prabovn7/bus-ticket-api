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
