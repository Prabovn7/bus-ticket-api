import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Field from './Field'

describe('Field', () => {
  it('liga o rótulo ao campo', () => {
    render(<Field label="E-mail" type="email" />)
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email')
  })

  it('repassa as demais propriedades ao input', () => {
    render(<Field label="Senha" type="password" autoComplete="current-password" />)
    const input = screen.getByLabelText('Senha')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'current-password')
  })

  it('sem erro, não mostra alerta nem marca o campo como inválido', () => {
    render(<Field label="E-mail" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('com erro, mostra o alerta e liga a mensagem ao campo', () => {
    render(<Field label="E-mail" error="Informe um e-mail válido." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um e-mail válido.')
    const input = screen.getByLabelText('E-mail')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Informe um e-mail válido.')
  })

  it('dois campos na mesma tela não compartilham o id', () => {
    render(
      <>
        <Field label="E-mail" />
        <Field label="Senha" />
      </>,
    )
    expect(screen.getByLabelText('E-mail').id).not.toBe(screen.getByLabelText('Senha').id)
  })
})
