import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { authWrapper, fakeAuth } from '../test/auth'
import LoginPage from './LoginPage'

function renderLoginWith(state: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/entrar', element: <LoginPage /> },
      { path: '/', element: <p>Página inicial</p> },
      { path: '/viagens/:tripId', element: <p>Página do assento</p> },
      { path: '/criar-conta', element: <p>Página de cadastro</p> },
    ],
    { initialEntries: [{ pathname: '/entrar', state }] },
  )
  const login = vi.fn().mockResolvedValue(undefined)
  render(<RouterProvider router={router} />, { wrapper: authWrapper(fakeAuth({ login })) })
  return router
}

async function signIn() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com')
  await user.type(screen.getByLabelText('Senha'), 'segredo123')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('LoginPage: voltar para onde a pessoa estava', () => {
  it('depois de entrar, volta para a página que mandou ao Entrar', async () => {
    const router = renderLoginWith({ from: '/viagens/7' })

    await signIn()

    expect(await screen.findByText('Página do assento')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/viagens/7')
  })

  it('sem página de origem, vai para a busca', async () => {
    renderLoginWith(undefined)

    await signIn()

    expect(await screen.findByText('Página inicial')).toBeInTheDocument()
  })

  it.each([
    'https://evil.com/x',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    'javascript:alert(1)',
  ])('a origem "%s" não é do site: vai para a busca', async (from) => {
    renderLoginWith({ from })

    await signIn()

    expect(await screen.findByText('Página inicial')).toBeInTheDocument()
  })

  it.each(['/criar-conta', '/entrar'])('não "volta" para %s: vai para a busca', async (from) => {
    renderLoginWith({ from })

    await signIn()

    expect(await screen.findByText('Página inicial')).toBeInTheDocument()
  })

  it('troca a entrada do Entrar no histórico, para o botão voltar não reabrir o formulário', async () => {
    const router = renderLoginWith({ from: '/viagens/7' })

    await signIn()

    await screen.findByText('Página do assento')
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
