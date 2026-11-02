import { describe, expect, it } from 'vitest'
import { controllableFetch, jsonResponse, stubRoutes } from '../test/http'
import { getAvailability } from './booking'
import type { TripAvailability } from './types'

const rows: TripAvailability[] = [
  { trip_id: 3, capacity: 40, free: 37 },
  { trip_id: 1, capacity: 40, free: 0 },
]

describe('getAvailability', () => {
  it('manda um trip_ids por viagem, na ordem recebida, e devolve o JSON', async () => {
    const { seen } = stubRoutes({
      '/api/trips/availability?trip_ids=3&trip_ids=1': [jsonResponse(rows)],
    })

    expect(await getAvailability([3, 1])).toEqual(rows)
    expect(seen.map((call) => call.url)).toEqual(['/api/trips/availability?trip_ids=3&trip_ids=1'])
  })

  it('não envia Authorization: a consulta é pública', async () => {
    const { seen } = stubRoutes({
      '/api/trips/availability?trip_ids=3&trip_ids=1': [jsonResponse(rows)],
    })

    await getAvailability([3, 1])

    expect(seen[0]?.auth).toBeNull()
  })

  it('deixa o ApiRequestError passar', async () => {
    stubRoutes({
      '/api/trips/availability?trip_ids=1': [
        jsonResponse({ detail: [{ msg: 'muitos ids' }] }, 422),
      ],
    })

    await expect(getAvailability([1])).rejects.toMatchObject({
      status: 422,
      code: 'validation_error',
    })
  })

  it('repassa o AbortSignal ao fetch', async () => {
    const { calls } = controllableFetch()
    const controller = new AbortController()

    const pending = getAvailability([1], controller.signal)
    expect(calls[0]?.signal).toBe(controller.signal)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
