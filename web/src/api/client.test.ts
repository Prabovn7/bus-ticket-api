import { describe, expect, it, vi } from 'vitest'
import { jsonResponse } from '../test/http'
import { ApiRequestError, apiFetch } from './client'

function mockFetch(implementation: () => Promise<Response>) {
  const fetchMock = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('apiFetch', () => {
  it('devolve o JSON quando a resposta é 200', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(jsonResponse([{ id: 1 }])))
    expect(await apiFetch('/api/cities')).toEqual([{ id: 1 }])
    expect(fetchMock).toHaveBeenCalledWith('/api/cities', undefined)
  })

  it('devolve undefined quando a resposta é 204', async () => {
    mockFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    expect(await apiFetch('/api/auth/logout')).toBeUndefined()
  })

  it('transforma o erro de domínio {code, message} em ApiRequestError', async () => {
    mockFetch(() =>
      Promise.resolve(
        jsonResponse({ code: 'city_not_found', message: 'Cidade não encontrada.' }, 404),
      ),
    )
    const error = await apiFetch('/api/trips').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      status: 404,
      code: 'city_not_found',
      message: 'Cidade não encontrada.',
    })
  })

  it('transforma o erro de validação {detail} do FastAPI em validation_error', async () => {
    mockFetch(() =>
      Promise.resolve(
        jsonResponse(
          {
            detail: [
              {
                type: 'date_from_datetime_parsing',
                loc: ['query', 'date'],
                msg: 'x',
              },
            ],
          },
          422,
        ),
      ),
    )
    const error = await apiFetch('/api/trips').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_error',
      message: expect.any(String),
    })
  })

  it('transforma uma resposta de erro sem JSON em unknown_error', async () => {
    mockFetch(() => Promise.resolve(new Response('Internal Server Error', { status: 500 })))
    const error = await apiFetch('/api/cities').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 500, code: 'unknown_error' })
  })

  it('transforma falha de rede em network_error com status 0', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    const error = await apiFetch('/api/cities').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 0, code: 'network_error' })
  })

  it('deixa o AbortError passar, sem virar erro de rede', async () => {
    mockFetch(() => Promise.reject(new DOMException('Aborted', 'AbortError')))
    const error = await apiFetch('/api/cities').catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ name: 'AbortError' })
  })
})
