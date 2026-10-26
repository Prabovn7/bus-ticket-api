import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { routes } from './router'
import { authWrapper, fakeAuth } from './test/auth'

function renderAt(path: string, { strict = false } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const app = <RouterProvider router={router} />
  return render(strict ? <StrictMode>{app}</StrictMode> : app, {
    wrapper: authWrapper(fakeAuth()),
  })
}

beforeEach(() => {
  document.title = ''
})

describe('título da aba', () => {
  it.each([
    ['/', 'Buscar viagens | Ônibora'],
    ['/entrar', 'Entrar | Ônibora'],
    ['/criar-conta', 'Criar conta | Ônibora'],
  ])('%s define o título "%s"', (path, title) => {
    renderAt(path)
    expect(document.title).toBe(title)
  })

  it('atualiza o título ao trocar de rota', async () => {
    const user = userEvent.setup()
    renderAt('/entrar')

    await user.click(screen.getByRole('link', { name: 'Criar conta' }))

    await waitFor(() => expect(document.title).toBe('Criar conta | Ônibora'))
  })
})

describe('foco ao trocar de rota', () => {
  it('não move o foco no carregamento inicial', () => {
    renderAt('/entrar')
    expect(document.body).toHaveFocus()
  })

  it('não move o foco no carregamento inicial dentro do StrictMode', () => {
    renderAt('/entrar', { strict: true })
    expect(document.body).toHaveFocus()
  })

  it('leva o foco ao título da nova tela depois de navegar', async () => {
    const user = userEvent.setup()
    renderAt('/entrar')

    await user.click(screen.getByRole('link', { name: 'Criar conta' }))

    const heading = await screen.findByRole('heading', { level: 1, name: 'Criar conta' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('não move o foco ao clicar no link da tela em que já está', async () => {
    const user = userEvent.setup()
    renderAt('/entrar')

    await user.click(screen.getByRole('link', { name: 'Entrar' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).not.toHaveFocus()
  })
})
