import { render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../auth/authContext'
import { authWrapper, fakeAuth } from '../test/auth'
import { controllableFetch, jsonResponse, stubRoutes } from '../test/http'
import RegisterPage from './RegisterPage'

const createdUser = { id: 7, email: 'ana@exemplo.com', name: 'Ana Souza' }

function renderRegister(login: AuthContextValue['login'] = vi.fn().mockResolvedValue(undefined)) {
  const router = createMemoryRouter(
    [
      { path: '/criar-conta', element: <RegisterPage /> },
      { path: '/', element: <p>Página inicial</p> },
    ],
    { initialEntries: ['/criar-conta'] },
  )
  render(<RouterProvider router={router} />, { wrapper: authWrapper(fakeAuth({ login })) })
  return login
}

async function fillForm(user: UserEvent, password = 'segredo123', name = 'Ana Souza') {
  await user.type(screen.getByLabelText('Nome'), name)
  await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com')
  await user.type(screen.getByLabelText('Senha'), password)
}

async function submit(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Criar conta' }))
}

describe('RegisterPage', () => {
  it('mostra o título, os campos com rótulo e o botão', () => {
    renderRegister()
    expect(screen.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeInTheDocument()

    const name = screen.getByLabelText('Nome')
    expect(name).toHaveAttribute('autocomplete', 'name')
    expect(name).toHaveAttribute('maxlength', '120')

    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email')

    const password = screen.getByLabelText('Senha')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'new-password')
    expect(password).toHaveAttribute('maxlength', '128')

    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled()
  })

  it('senha curta mostra a mensagem no campo e não chama a API', async () => {
    const user = userEvent.setup()
    const { seen } = stubRoutes({})
    const login = renderRegister()
    await fillForm(user, '1234567')
    await submit(user)

    const password = screen.getByLabelText('Senha')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAccessibleDescription('Use pelo menos 8 caracteres.')
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('aria-invalid', 'true')
    expect(seen).toHaveLength(0)
    expect(login).not.toHaveBeenCalled()
  })

  it('nome só com espaços mostra a mensagem no campo e não chama a API', async () => {
    const user = userEvent.setup()
    const { seen } = stubRoutes({})
    renderRegister()
    await fillForm(user, 'segredo123', '   ')
    await submit(user)

    const name = screen.getByLabelText('Nome')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Informe seu nome.')
    expect(seen).toHaveLength(0)
  })

  it('cria a conta, entra automaticamente e vai para a busca', async () => {
    const user = userEvent.setup()
    stubRoutes({ '/api/auth/register': [jsonResponse(createdUser, 201)] })
    const login = renderRegister()
    await fillForm(user)
    await submit(user)

    expect(await screen.findByText('Página inicial')).toBeInTheDocument()
    expect(login).toHaveBeenCalledWith('ana@exemplo.com', 'segredo123')

    const init = vi.mocked(fetch).mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'ana@exemplo.com',
      password: 'segredo123',
      name: 'Ana Souza',
    })
  })

  it('e-mail já cadastrado vira erro no campo e-mail, sem navegar', async () => {
    const user = userEvent.setup()
    stubRoutes({
      '/api/auth/register': [
        jsonResponse({ code: 'email_already_registered', message: 'E-mail já cadastrado.' }, 409),
      ],
    })
    const login = renderRegister()
    await fillForm(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma conta com este e-mail.',
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Senha')).not.toHaveAttribute('aria-invalid', 'true')
    expect(login).not.toHaveBeenCalled()
    expect(screen.queryByText('Página inicial')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled()
  })

  it('erro de validação da API mostra um aviso geral, sem marcar campo', async () => {
    const user = userEvent.setup()
    stubRoutes({
      '/api/auth/register': [
        jsonResponse(
          { detail: [{ loc: ['body', 'email'], msg: 'invalid', type: 'value_error' }] },
          422,
        ),
      ],
    })
    renderRegister()
    await fillForm(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Confira os dados informados.')
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('falha de rede mostra a mensagem do cliente da API', async () => {
    const user = userEvent.setup()
    stubRoutes({})
    renderRegister()
    await fillForm(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Não foi possível falar com o servidor/,
    )
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled()
  })

  it('resposta inválida do servidor mostra uma mensagem genérica', async () => {
    const user = userEvent.setup()
    stubRoutes({ '/api/auth/register': [new Response('isto não é JSON', { status: 201 })] })
    const login = renderRegister()
    await fillForm(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado. Tente de novo.')
    expect(login).not.toHaveBeenCalled()
  })

  it('conta criada mas login automático falhou: avisa que a conta existe e não navega', async () => {
    const user = userEvent.setup()
    stubRoutes({ '/api/auth/register': [jsonResponse(createdUser, 201)] })
    const login = renderRegister(vi.fn().mockRejectedValue(new Error('boom interno')))
    await fillForm(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sua conta foi criada')
    expect(screen.queryByText(/boom interno/)).not.toBeInTheDocument()
    expect(login).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Página inicial')).not.toBeInTheDocument()
  })

  it('desabilita o botão durante o envio e não envia duas vezes', async () => {
    const user = userEvent.setup()
    const { fetchMock, calls } = controllableFetch()
    const login = renderRegister()
    await fillForm(user)
    await submit(user)

    const button = screen.getByRole('button', { name: 'Criar conta' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    calls[0]?.resolve(jsonResponse(createdUser, 201))
    expect(await screen.findByText('Página inicial')).toBeInTheDocument()
    expect(login).toHaveBeenCalledTimes(1)
  })
})
