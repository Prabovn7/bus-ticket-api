import { beforeEach, describe, expect, it } from 'vitest'
import type { User } from '../api/types'
import { jsonResponse, stubRoutes } from '../test/http'
import { authedFetch } from './authedFetch'
import { tokenStore } from './tokenStore'

const ME = '/api/auth/me'
const REFRESH = '/api/auth/refresh'
const USER: User = { id: 1, email: 'ana@exemplo.com', name: 'Ana' }
const UNAUTHENTICATED = { code: 'not_authenticated', message: 'Faça login.' }

function tokenResponse(token: string): Response {
  return jsonResponse({ access_token: token, token_type: 'bearer', expires_in: 900 })
}

describe('authedFetch', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  it('envia o token atual no cabeçalho Authorization', async () => {
    tokenStore.set('token-a')
    const { seen } = stubRoutes({ [ME]: [jsonResponse(USER)] })

    await expect(authedFetch<User>(ME)).resolves.toEqual(USER)

    expect(seen).toEqual([{ url: ME, auth: 'Bearer token-a' }])
  })

  it('sem token, não envia o cabeçalho', async () => {
    const { seen } = stubRoutes({ [ME]: [jsonResponse(USER)] })

    await authedFetch<User>(ME)

    expect(seen[0]?.auth).toBeNull()
  })

  it('em 401, renova uma vez e repete a requisição com o token novo', async () => {
    tokenStore.set('token-velho')
    const { seen } = stubRoutes({
      [ME]: [jsonResponse(UNAUTHENTICATED, 401), jsonResponse(USER)],
      [REFRESH]: [tokenResponse('token-novo')],
    })

    await expect(authedFetch<User>(ME)).resolves.toEqual(USER)

    expect(seen).toEqual([
      { url: ME, auth: 'Bearer token-velho' },
      { url: REFRESH, auth: null },
      { url: ME, auth: 'Bearer token-novo' },
    ])
  })

  it('se o segundo envio também der 401, desiste: uma renovação, uma repetição', async () => {
    tokenStore.set('token-velho')
    const { seen } = stubRoutes({
      [ME]: [jsonResponse(UNAUTHENTICATED, 401), jsonResponse(UNAUTHENTICATED, 401)],
      [REFRESH]: [tokenResponse('token-novo')],
    })

    await expect(authedFetch<User>(ME)).rejects.toMatchObject({ status: 401 })

    expect(seen.map((call) => call.url)).toEqual([ME, REFRESH, ME])
  })

  it('se a renovação falha, rejeita, limpa o token e não repete a requisição', async () => {
    tokenStore.set('token-velho')
    const { seen } = stubRoutes({
      [ME]: [jsonResponse(UNAUTHENTICATED, 401)],
      [REFRESH]: [
        jsonResponse({ code: 'invalid_refresh_token', message: 'Sessão inválida.' }, 401),
      ],
    })

    await expect(authedFetch<User>(ME)).rejects.toMatchObject({ code: 'invalid_refresh_token' })

    expect(seen.map((call) => call.url)).toEqual([ME, REFRESH])
    expect(tokenStore.get()).toBeNull()
  })

  it('erro que não é 401 não dispara renovação', async () => {
    tokenStore.set('token-a')
    const { seen } = stubRoutes({
      [ME]: [jsonResponse({ code: 'not_found', message: 'Não achei.' }, 404)],
    })

    await expect(authedFetch<User>(ME)).rejects.toMatchObject({ status: 404 })

    expect(seen.map((call) => call.url)).toEqual([ME])
  })

  it('dois 401 ao mesmo tempo fazem uma única renovação', async () => {
    tokenStore.set('token-velho')
    const { seen } = stubRoutes({
      [ME]: [
        jsonResponse(UNAUTHENTICATED, 401),
        jsonResponse(UNAUTHENTICATED, 401),
        jsonResponse(USER),
        jsonResponse(USER),
      ],
      [REFRESH]: [tokenResponse('token-novo')],
    })

    await Promise.all([authedFetch<User>(ME), authedFetch<User>(ME)])

    expect(seen.filter((call) => call.url === REFRESH)).toHaveLength(1)
  })
})
