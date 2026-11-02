import { describe, expect, it } from 'vitest'
import { jsonResponse, stubRoutes } from '../test/http'
import { getSeatMap } from './booking'
import type { SeatMap } from './types'

const seatMap: SeatMap = {
  trip_id: 7,
  capacity: 2,
  seats: [
    { seat_number: 1, status: 'free' },
    { seat_number: 2, status: 'held' },
  ],
}

describe('getSeatMap', () => {
  it('pede os assentos da viagem e devolve o JSON', async () => {
    const { seen } = stubRoutes({ '/api/trips/7/seats': [jsonResponse(seatMap)] })

    expect(await getSeatMap(7)).toEqual(seatMap)
    expect(seen.map((call) => call.url)).toEqual(['/api/trips/7/seats'])
  })

  it('não envia Authorization: a grade é pública', async () => {
    const { seen } = stubRoutes({ '/api/trips/7/seats': [jsonResponse(seatMap)] })

    await getSeatMap(7)

    expect(seen[0]?.auth).toBeNull()
  })

  it('deixa o ApiRequestError do 404 passar', async () => {
    stubRoutes({
      '/api/trips/9/seats': [
        jsonResponse({ code: 'trip_not_found', message: 'Viagem não encontrada.' }, 404),
      ],
    })

    await expect(getSeatMap(9)).rejects.toMatchObject({ status: 404, code: 'trip_not_found' })
  })
})
