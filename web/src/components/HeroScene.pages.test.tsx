import { render, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { routes } from '../router'
import { authWrapper, fakeAuth } from '../test/auth'

function renderAt(path: string) {
  // A busca pede as cidades; sem resposta, a tela fica no estado de carregamento, que basta aqui.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />, { wrapper: authWrapper(fakeAuth()) })
  const scenes = view.container.querySelectorAll<HTMLElement>('[data-cena]')
  return { ...view, scenes }
}

describe.each([
  ['/', 'Para onde você vai?'],
  ['/entrar', 'Entrar'],
  ['/criar-conta', 'Criar conta'],
])('tela %s', (path, title) => {
  it('tem uma cena só, com o título da tela dentro', () => {
    const { scenes } = renderAt(path)

    expect(scenes).toHaveLength(1)
    expect(within(scenes[0]).getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it('a cena não envolve nem fica dentro de formulário, tabela ou alerta', () => {
    const { scenes } = renderAt(path)

    expect(scenes).toHaveLength(1)
    expect(scenes[0].closest('form, table, [role="alert"]')).toBeNull()
    expect(
      scenes[0].querySelector('form, table, input, select, textarea, [role="alert"]'),
    ).toBeNull()
  })

  it('não há vídeo na tela', () => {
    const { container } = renderAt(path)

    expect(container.querySelector('video')).toBeNull()
  })
})
