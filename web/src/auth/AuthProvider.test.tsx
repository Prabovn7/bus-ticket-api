import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { jsonResponse, stubRoutes } from '../test/http'
import { AuthProvider } from './AuthProvider'
import { tokenStore } from './tokenStore'
import { useAuth } from './useAuth'

const REFRESH = '/api/auth/refresh'
const LOGIN = '/api/auth/login'
const LOGOUT = '/api/auth/logout'
const ME = '/api/auth/me'
const USER: User = { id: 1, email: 'ana@exemplo.com', name: 'Ana' }

function tokenResponse(token: string): Response {
  return jsonResponse({ access_token: token, token_type: 'bearer', expires_in: 900 })
}

function invalidSession(): Response {
  return jsonResponse({ code: 'invalid_refresh_token', message: 'Sessão inválida.' }, 401)
}

function Probe() {
  const { status, user, login, logout } = useAuth()
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="nome">{user?.name ?? 'ninguém'}</p>
      <button type="button" onClick={() => void login('ana@exemplo.com', 'senha-segura')}>
        entrar
      </button>
      <button type="button" onClick={() => void logout()}>
        sair
      </button>
    </div>
  )
}

function renderProvider(options: { strict?: boolean } = {}) {
  const tree = (
    <AuthProvider>
      <Probe />
    </AuthProvider>
  )
  return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree)
}

describe('AuthProvider', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  it('começa em loading e, com cookie válido, termina autenticado', async () => {
    stubRoutes({ [REFRESH]: [tokenResponse('token-a')], [ME]: [jsonResponse(USER)] })

    renderProvider()

    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(screen.getByTestId('nome')).toHaveTextContent('Ana')
  })

  it('dentro do StrictMode, faz uma única chamada a /api/auth/refresh', async () => {
    const { seen } = stubRoutes({
      [REFRESH]: [tokenResponse('token-a')],
      [ME]: [jsonResponse(USER)],
    })

    renderProvider({ strict: true })

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(seen.filter((call) => call.url === REFRESH)).toHaveLength(1)
    expect(seen.filter((call) => call.url === ME)).toHaveLength(1)
  })

  it('sem cookie válido, fica anonymous e não pede o perfil', async () => {
    const { seen } = stubRoutes({ [REFRESH]: [invalidSession()] })

    renderProvider()

    expect(await screen.findByText('anonymous')).toBeInTheDocument()
    expect(seen.map((call) => call.url)).toEqual([REFRESH])
  })

  it('se o perfil falha depois da renovação, fica anonymous', async () => {
    stubRoutes({
      [REFRESH]: [tokenResponse('token-a')],
      [ME]: [jsonResponse({ code: 'unknown_error', message: 'Falha.' }, 500)],
    })

    renderProvider()

    expect(await screen.findByText('anonymous')).toBeInTheDocument()
  })

  it('login troca anonymous por authenticated e mostra o nome', async () => {
    const user = userEvent.setup()
    stubRoutes({
      [REFRESH]: [invalidSession()],
      [LOGIN]: [tokenResponse('token-b')],
      [ME]: [jsonResponse(USER)],
    })
    renderProvider()
    await screen.findByText('anonymous')

    await user.click(screen.getByRole('button', { name: 'entrar' }))

    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    expect(screen.getByTestId('nome')).toHaveTextContent('Ana')
    expect(tokenStore.get()).toBe('token-b')
  })

  it('logout volta a anonymous, chama a API e limpa o token', async () => {
    const user = userEvent.setup()
    const { seen } = stubRoutes({
      [REFRESH]: [tokenResponse('token-a')],
      [ME]: [jsonResponse(USER)],
      [LOGOUT]: [new Response(null, { status: 204 })],
    })
    renderProvider()
    await screen.findByText('authenticated')

    await user.click(screen.getByRole('button', { name: 'sair' }))

    expect(await screen.findByText('anonymous')).toBeInTheDocument()
    expect(screen.getByTestId('nome')).toHaveTextContent('ninguém')
    expect(seen.some((call) => call.url === LOGOUT)).toBe(true)
    expect(tokenStore.get()).toBeNull()
  })

  it('useAuth fora do AuthProvider lança um erro claro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow(/AuthProvider/)
  })
})
