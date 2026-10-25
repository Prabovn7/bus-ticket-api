import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../auth/authContext'
import { authWrapper, fakeAuth } from '../test/auth'
import Header from './Header'

function renderHeader(auth: AuthContextValue = fakeAuth()) {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
    { wrapper: authWrapper(auth) },
  )
}

const ana = { id: 1, email: 'ana@exemplo.com', name: 'Ana Souza' }

describe('Header', () => {
  it('anônimo: mostra a marca, os links de navegação e não mostra Sair', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'ônibora' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/criar-conta',
    )
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument()
  })

  it('carregando: não mostra Entrar, Criar conta nem Sair, para não piscar', () => {
    renderHeader(fakeAuth({ status: 'loading' }))
    expect(screen.getByRole('link', { name: 'Buscar' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument()
  })

  it('autenticado: mostra o nome e Sair, sem Entrar nem Criar conta', () => {
    renderHeader(fakeAuth({ status: 'authenticated', user: ana }))
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument()
  })

  it('nome com HTML aparece como texto', () => {
    const name = '<script>alert(1)</script>'
    const { container } = renderHeader(
      fakeAuth({ status: 'authenticated', user: { ...ana, name } }),
    )
    expect(screen.getByText(name)).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
  })

  it('Sair chama o logout', async () => {
    const user = userEvent.setup()
    const logout = vi.fn().mockResolvedValue(undefined)
    renderHeader(fakeAuth({ status: 'authenticated', user: ana, logout }))
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('um logout que falha não deixa erro sem tratamento', async () => {
    // Sem asserção direta: o Vitest reprova a execução se sobrar uma rejeição sem tratamento.
    const user = userEvent.setup()
    const logout = vi.fn().mockRejectedValue(new Error('falhou'))
    renderHeader(fakeAuth({ status: 'authenticated', user: ana, logout }))
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('o botão de tema alterna o tema e muda o nome acessível', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByRole('button', { name: 'Mudar para o tema escuro' }))
    expect(document.documentElement.dataset.tema).toBe('escuro')
    expect(screen.getByRole('button', { name: 'Mudar para o tema claro' })).toBeInTheDocument()
  })
})
