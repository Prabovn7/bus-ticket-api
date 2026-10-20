import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../api/client'
import { controllableFetch, jsonResponse } from '../test/http'
import { login, logout, refresh } from './authApi'
import { tokenStore } from './tokenStore'

const TOKEN_BODY = { access_token: 'token-novo', token_type: 'bearer', expires_in: 900 }

describe('authApi', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  describe('refresh', () => {
    it('duas chamadas simultâneas fazem uma única requisição', async () => {
      const { fetchMock, calls } = controllableFetch()

      const first = refresh()
      const second = refresh()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/refresh')

      calls[0]?.resolve(jsonResponse(TOKEN_BODY))

      await expect(first).resolves.toBe('token-novo')
      await expect(second).resolves.toBe('token-novo')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('depois que o voo termina, a próxima chamada faz outra requisição', async () => {
      const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(TOKEN_BODY)))
      vi.stubGlobal('fetch', fetchMock)

      await refresh()
      await refresh()

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('guarda o token novo em memória', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(jsonResponse(TOKEN_BODY))),
      )

      await refresh()

      expect(tokenStore.get()).toBe('token-novo')
    })

    it('se a renovação falha, rejeita com o erro da API e limpa o token', async () => {
      tokenStore.set('token-velho')
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            jsonResponse({ code: 'invalid_refresh_token', message: 'Sessão inválida.' }, 401),
          ),
        ),
      )

      await expect(refresh()).rejects.toMatchObject({
        status: 401,
        code: 'invalid_refresh_token',
      })
      await expect(refresh()).rejects.toBeInstanceOf(ApiRequestError)
      expect(tokenStore.get()).toBeNull()
    })

    it('uma falha libera o voo: a chamada seguinte tenta de novo', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ code: 'invalid_refresh_token', message: 'x' }, 401))
        .mockResolvedValueOnce(jsonResponse(TOKEN_BODY))
      vi.stubGlobal('fetch', fetchMock)

      await expect(refresh()).rejects.toBeInstanceOf(ApiRequestError)
      await expect(refresh()).resolves.toBe('token-novo')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('login', () => {
    it('envia e-mail e senha em JSON e guarda o token em memória', async () => {
      const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(TOKEN_BODY)))
      vi.stubGlobal('fetch', fetchMock)

      await login('ana@exemplo.com', 'senha-segura')

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('/api/auth/login')
      expect(init.method).toBe('POST')
      expect(init.body).toBe(JSON.stringify({ email: 'ana@exemplo.com', password: 'senha-segura' }))
      expect(tokenStore.get()).toBe('token-novo')
    })

    it('nunca grava o token em localStorage nem sessionStorage', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(jsonResponse(TOKEN_BODY))),
      )

      await login('ana@exemplo.com', 'senha-segura')

      expect(JSON.stringify({ ...localStorage })).not.toContain('token-novo')
      expect(JSON.stringify({ ...sessionStorage })).not.toContain('token-novo')
    })
  })

  describe('logout', () => {
    it('chama a API e limpa o token mesmo com resposta 204', async () => {
      tokenStore.set('token-velho')
      const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
      vi.stubGlobal('fetch', fetchMock)

      await logout()

      const [url] = fetchMock.mock.calls[0] as unknown as [string]
      expect(url).toBe('/api/auth/logout')
      expect(tokenStore.get()).toBeNull()
    })
  })
})
