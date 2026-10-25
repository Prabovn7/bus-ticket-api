import { describe, expect, it } from 'vitest'
import { contrast, ruleBody, tokensOf, tokenUsed } from '../test/css'
import css from './rodoviaria.css?raw'

if (css.length === 0) {
  throw new Error('rodoviaria.css veio vazio: confira test.css.include no vite.config.ts')
}

const claro = tokensOf(ruleBody(css, ':root'))
const escuro = { ...claro, ...tokensOf(ruleBody(css, ":root[data-tema='escuro']")) }
const borderToken = tokenUsed(ruleBody(css, '.botao-tema'), 'border')
const backgroundToken = tokenUsed(ruleBody(css, '.topo'), 'background')

describe('contraste do botão de tema', () => {
  it.each([
    { theme: 'claro', tokens: claro },
    { theme: 'escuro', tokens: escuro },
  ])('tema $theme: a borda tem pelo menos 3:1 contra o fundo do topo', ({ tokens }) => {
    const ratio = contrast(tokens[borderToken], tokens[backgroundToken])
    expect(ratio).toBeGreaterThanOrEqual(3)
  })
})

describe('contraste do logo no topo', () => {
  it.each([
    { theme: 'claro', tokens: claro },
    { theme: 'escuro', tokens: escuro },
  ])(
    'tema $theme: o logo tem cor própria com pelo menos 4,5:1 contra o fundo do topo',
    ({ tokens }) => {
      // Sem `color` na regra, o link herda a cor padrão do navegador (azul no tema claro).
      const brandToken = tokenUsed(ruleBody(css, '.marca'), 'color')
      const ratio = contrast(tokens[brandToken], tokens[backgroundToken])
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    },
  )
})
