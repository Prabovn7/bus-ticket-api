import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import Header from './Header'

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  )
}

describe('Header', () => {
  it('mostra a marca e os links de navegação', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'ônibora' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/criar-conta',
    )
  })

  it('o botão de tema alterna o tema e muda o nome acessível', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByRole('button', { name: 'Mudar para o tema escuro' }))
    expect(document.documentElement.dataset.tema).toBe('escuro')
    expect(screen.getByRole('button', { name: 'Mudar para o tema claro' })).toBeInTheDocument()
  })
})
