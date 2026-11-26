import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { jsonResponse, stubRoutes } from '../test/http'
import { pay } from './payments'

const approved = { payment_id: 9, status: 'approved', reservation_status: 'paid' }
const pending = { payment_id: 9, status: 'pending', reservation_status: 'held' }
const declined = { payment_id: 9, status: 'declined', reservation_status: 'held' }

describe('pay', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  it('faz POST em /pay com a chave de idempotência, o cenário e o token', async () => {
    tokenStore.set('token-a')
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(approved, 200)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(pay(5, 'approve', 'key-1')).resolves.toEqual(approved)

    const [url, init] = fetchMock.mock.calls[0] ?? []
    const headers = new Headers(init?.headers)
    expect(url).toBe('/api/reservations/5/pay')
    expect(init?.method).toBe('POST')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Authorization')).toBe('Bearer token-a')
    expect(headers.get('Idempotency-Key')).toBe('key-1')
    expect(JSON.parse(String(init?.body))).toEqual({ scenario: 'approve' })
  })

  it('202 (em análise) é um resultado: devolve o pagamento pendente', async () => {
    tokenStore.set('token-a')
    stubRoutes({ '/api/reservations/5/pay': [jsonResponse(pending, 202)] })

    await expect(pay(5, 'delay', 'key-2')).resolves.toEqual(pending)
  })

  it('402 (recusado) não lança: devolve o pagamento recusado', async () => {
    tokenStore.set('token-a')
    const { seen } = stubRoutes({ '/api/reservations/5/pay': [jsonResponse(declined, 402)] })

    await expect(pay(5, 'decline', 'key-3')).resolves.toEqual(declined)
    expect(seen.map((call) => call.url)).toEqual(['/api/reservations/5/pay'])
  })

  it('402 sem corpo de pagamento continua sendo erro', async () => {
    tokenStore.set('token-a')
    stubRoutes({ '/api/reservations/5/pay': [jsonResponse({ detail: 'proxy' }, 402)] })

    await expect(pay(5, 'approve', 'key-4')).rejects.toMatchObject({
      status: 402,
      code: 'unknown_error',
    })
  })

  it('erros de regra passam: 409 request_in_progress continua sendo ApiRequestError', async () => {
    tokenStore.set('token-a')
    stubRoutes({
      '/api/reservations/5/pay': [
        jsonResponse({ code: 'request_in_progress', message: 'Pagamento em andamento.' }, 409),
      ],
    })

    await expect(pay(5, 'approve', 'key-5')).rejects.toMatchObject({
      status: 409,
      code: 'request_in_progress',
    })
  })

  it('repassa o AbortSignal ao fetch', async () => {
    tokenStore.set('token-a')
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(approved, 200)))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await pay(5, 'approve', 'key-6', controller.signal)

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })
})
