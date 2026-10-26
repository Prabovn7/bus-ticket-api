import { beforeEach, describe, expect, it } from 'vitest'
import { tokenStore } from './tokenStore'

describe('tokenStore', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  it('começa sem token', () => {
    expect(tokenStore.get()).toBeNull()
  })

  it('guarda e devolve o token', () => {
    tokenStore.set('abc')
    expect(tokenStore.get()).toBe('abc')
  })

  it('clear apaga o token', () => {
    tokenStore.set('abc')
    tokenStore.clear()
    expect(tokenStore.get()).toBeNull()
  })
})
