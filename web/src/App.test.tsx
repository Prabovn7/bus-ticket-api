import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('mostra o título da busca', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Para onde você vai?' })).toBeInTheDocument()
  })
})
