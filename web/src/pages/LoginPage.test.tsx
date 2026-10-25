import { render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../api/client'
import type { AuthContextValue } from '../auth/authContext'
import { authWrapper, fakeAuth } from '../test/auth'
import LoginPage from './LoginPage'

function renderLogin(login: AuthContextValue['login']) {
  const router = createMemoryRouter(
    [
      { path: '/entrar', element: <LoginPage /> },
      { path: '/', element: <p>Página inicial</p> },
    ],
    { initialEntries: ['/entrar'] },
  )
  render(<RouterProvider router={router} />, { wrapper: authWrapper(fakeAuth({ login })) })
}

async function fillAndSubmit(user: UserEvent) {
  await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com')
  await user.type(screen.getByLabelText('Senha'), 'segredo123')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('LoginPage', () => {
  it('mostra o título, os campos com rótulo e o botão', () => {
    renderLogin(vi.fn().mockResolvedValue(undefined))
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  it('envia e-mail e senha e vai para a busca', async () => {
    const user = userEvent.setup()
    const login = vi.fn().mockResolvedValue(undefined)
    renderLogin(login)
    await fillAndSubmit(user)
    expect(login).toHaveBeenCalledWith('ana@exemplo.com', 'segredo123')
    expect(await screen.findByText('Página inicial')).toBeInTheDocument()
  })

  it('credenciais inválidas mostram uma única mensagem e não apontam o campo errado', async () => {
    const user = userEvent.setup()
    const login = vi
      .fn()
      .mockRejectedValue(new ApiRequestError(401, 'invalid_credentials', 'Credenciais inválidas.'))
    renderLogin(login)
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Senha')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Página inicial')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  it('outros erros da API mostram a mensagem recebida', async () => {
    const user = userEvent.setup()
    const login = vi
      .fn()
      .mockRejectedValue(
        new ApiRequestError(0, 'network_error', 'Não foi possível falar com o servidor.'),
      )
    renderLogin(login)
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o servidor.',
    )
  })

  it('um erro inesperado mostra uma mensagem genérica, sem vazar o texto do erro', async () => {
    const user = userEvent.setup()
    renderLogin(vi.fn().mockRejectedValue(new Error('boom interno')))
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado. Tente de novo.')
    expect(screen.queryByText(/boom interno/)).not.toBeInTheDocument()
  })

  it('desabilita o botão durante o envio e não envia duas vezes', async () => {
    const user = userEvent.setup()
    let finish!: () => void
    const login = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    renderLogin(login)
    await fillAndSubmit(user)

    const button = screen.getByRole('button', { name: 'Entrar' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(login).toHaveBeenCalledTimes(1)

    finish()
    expect(await screen.findByText('Página inicial')).toBeInTheDocument()
  })
})
