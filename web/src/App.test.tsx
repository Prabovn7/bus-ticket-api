import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { authWrapper, fakeAuth } from './test/auth'

describe('App', () => {
  it('mostra o título da busca', () => {
    render(<App />, { wrapper: authWrapper(fakeAuth()) })
    expect(screen.getByRole('heading', { name: 'Para onde você vai?' })).toBeInTheDocument()
  })
})
