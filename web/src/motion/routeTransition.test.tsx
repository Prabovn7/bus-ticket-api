import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { routes } from '../router'
import { authWrapper, fakeAuth } from '../test/auth'
import { mockMotionPreference } from '../test/motion'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function renderAt(path: string, { strict = false } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const app = <RouterProvider router={router} />
  return render(strict ? <StrictMode>{app}</StrictMode> : app, {
    wrapper: authWrapper(fakeAuth()),
  })
}

/** Visível quando ninguém mexeu na opacidade ou quando ela chegou a 1. */
function isVisible(element: HTMLElement): boolean {
  return element.style.opacity === '' || Number(element.style.opacity) === 1
}

/** Anota a opacidade do elemento a cada mudança de estilo. */
function watchStyle(element: HTMLElement) {
  const seen: string[] = []
  const observer = new MutationObserver(() => seen.push(element.style.opacity))
  observer.observe(element, { attributes: true, attributeFilter: ['style'] })
  return { seen, stop: () => observer.disconnect() }
}

describe('transição entre rotas', () => {
  it('não anima no carregamento inicial', async () => {
    renderAt('/entrar')
    const main = screen.getByRole('main')
    const watcher = watchStyle(main)

    await wait(400)
    watcher.stop()

    expect(watcher.seen).toEqual([])
  })

  it('não anima no carregamento inicial dentro do StrictMode', async () => {
    renderAt('/entrar', { strict: true })
    const main = screen.getByRole('main')
    const watcher = watchStyle(main)

    await wait(400)
    watcher.stop()

    expect(watcher.seen).toEqual([])
    expect(isVisible(main)).toBe(true)
  })

  it('ao navegar, o conteúdo entra com fade e termina visível em até 0,5 s', async () => {
    const user = userEvent.setup()
    renderAt('/entrar')
    const main = screen.getByRole('main')
    const watcher = watchStyle(main)

    await user.click(screen.getByRole('link', { name: 'Criar conta' }))

    await waitFor(
      () => expect(watcher.seen.some((value) => value !== '' && Number(value) < 1)).toBe(true),
      { timeout: 1000 },
    )
    await waitFor(() => expect(isVisible(main)).toBe(true), { timeout: 500 })
    watcher.stop()
  })

  it('com movimento reduzido, navegar não mexe no estilo do conteúdo', async () => {
    mockMotionPreference(true)
    const user = userEvent.setup()
    renderAt('/entrar')
    const main = screen.getByRole('main')
    const watcher = watchStyle(main)

    await user.click(screen.getByRole('link', { name: 'Criar conta' }))
    await screen.findByRole('heading', { level: 1, name: 'Criar conta' })
    await wait(400)
    watcher.stop()

    expect(watcher.seen).toEqual([])
  })

  it('clicar no link da própria rota não anima', async () => {
    const user = userEvent.setup()
    renderAt('/entrar')
    const main = screen.getByRole('main')
    const watcher = watchStyle(main)

    await user.click(screen.getByRole('link', { name: 'Entrar' }))
    await wait(400)
    watcher.stop()

    expect(watcher.seen).toEqual([])
  })

  it('navegar duas vezes seguidas não deixa o conteúdo preso invisível', async () => {
    const user = userEvent.setup()
    renderAt('/entrar')
    const main = screen.getByRole('main')

    await user.click(screen.getByRole('link', { name: 'Criar conta' }))
    await user.click(screen.getByRole('link', { name: 'Entrar' }))

    await waitFor(() => expect(isVisible(main)).toBe(true), { timeout: 1000 })
    await wait(300)
    expect(isVisible(main)).toBe(true)
  })
})
