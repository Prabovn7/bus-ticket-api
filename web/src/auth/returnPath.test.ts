import { describe, expect, it } from 'vitest'
import { returnPath } from './returnPath'

describe('returnPath', () => {
  it('devolve o caminho de dentro do site que veio no estado', () => {
    expect(returnPath({ from: '/viagens/7' })).toBe('/viagens/7')
  })

  it('mantém a busca e o trecho depois do #, se houver', () => {
    expect(returnPath({ from: '/viagens/7?a=1#topo' })).toBe('/viagens/7?a=1#topo')
  })

  it.each([
    ['sem estado (undefined)', undefined],
    ['estado null', null],
    ['estado que não é objeto', 'texto'],
    ['objeto sem from', {}],
    ['from que não é texto', { from: 42 }],
  ])('%s volta para a busca', (_label, state) => {
    expect(returnPath(state)).toBe('/')
  })

  it.each([
    ['endereço de outro site', 'https://evil.com/entrar'],
    ['sem protocolo, começando com //', '//evil.com'],
    ['com barra invertida', '/\\evil.com'],
    ['com tabulação escondida', '/\t/evil.com'],
    ['javascript:', 'javascript:alert(1)'],
  ])('%s é ignorado e volta para a busca', (_label, from) => {
    expect(returnPath({ from })).toBe('/')
  })

  it.each(['/entrar', '/criar-conta'])('%s não é lugar para voltar: vai para a busca', (from) => {
    expect(returnPath({ from })).toBe('/')
  })
})
