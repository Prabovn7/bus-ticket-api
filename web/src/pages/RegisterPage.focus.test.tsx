import { render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { authWrapper, fakeAuth } from '../test/auth'
import { jsonResponse, stubRoutes } from '../test/http'
import RegisterPage from './RegisterPage'

function renderRegister() {
  const router = createMemoryRouter([{ path: '/criar-conta', element: <RegisterPage /> }], {
    initialEntries: ['/criar-conta'],
  })
  render(<RouterProvider router={router} />, { wrapper: authWrapper(fakeAuth()) })
}

async function fillForm(user: UserEvent, { name = 'Ana Souza', password = 'segredo123' } = {}) {
  await user.type(screen.getByLabelText('Nome'), name)
  await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com')
  await user.type(screen.getByLabelText('Senha'), password)
}

async function submit(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Criar conta' }))
}

describe('RegisterPage: foco no primeiro campo inválido', () => {
  it('senha curta leva o foco ao campo Senha', async () => {
    const user = userEvent.setup()
    stubRoutes({})
    renderRegister()
    await fillForm(user, { password: '1234567' })
    await submit(user)

    await waitFor(() => expect(screen.getByLabelText('Senha')).toHaveFocus())
  })

  it('nome em branco e senha curta levam o foco ao Nome, o primeiro da tela', async () => {
    const user = userEvent.setup()
    stubRoutes({})
    renderRegister()
    await fillForm(user, { name: '   ', password: '1234567' })
    await submit(user)

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus())
  })

  it('e-mail já cadastrado leva o foco ao campo E-mail', async () => {
    const user = userEvent.setup()
    stubRoutes({
      '/api/auth/register': [
        jsonResponse({ code: 'email_already_registered', message: 'E-mail já cadastrado.' }, 409),
      ],
    })
    renderRegister()
    await fillForm(user)
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma conta com este e-mail.',
    )
    await waitFor(() => expect(screen.getByLabelText('E-mail')).toHaveFocus())
  })
})
