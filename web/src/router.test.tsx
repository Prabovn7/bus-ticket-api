import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { routes } from './router'
import { authWrapper, fakeAuth } from './test/auth'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />, { wrapper: authWrapper(fakeAuth()) })
}

describe('rotas', () => {
  it.each([
    ['/', 'Para onde você vai?'],
    ['/entrar', 'Entrar'],
    ['/criar-conta', 'Criar conta'],
  ])('%s mostra o título "%s"', (path, title) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it('tem o link para pular ao conteúdo e o main com o id certo', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute(
      'href',
      '#conteudo',
    )
    expect(screen.getByRole('main')).toHaveAttribute('id', 'conteudo')
  })
})
