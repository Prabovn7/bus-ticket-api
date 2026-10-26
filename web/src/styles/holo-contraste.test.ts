import { describe, expect, it } from 'vitest'
import { blend, contrast, ruleBody, tokensOf, tokensUsedIn, tokenUsed } from '../test/css'
import holo from './holo.css?raw'
import base from './rodoviaria.css?raw'

if (holo.length === 0 || base.length === 0) {
  throw new Error('CSS veio vazio: confira test.css.include no vite.config.ts')
}

const claro = tokensOf(ruleBody(base, ':root'))
const escuro = { ...claro, ...tokensOf(ruleBody(base, ":root[data-tema='escuro']")) }

const alpha = Number(ruleBody(holo, ':root').match(/--holo-alfa:\s*([\d.]+)\s*;/)?.[1])
const backgroundToken = tokenUsed(ruleBody(holo, '.holo'), 'background')
const textToken = tokenUsed(ruleBody(holo, '.holo'), 'color')
const glowTokens = tokensUsedIn(ruleBody(holo, '.holo-brilho'), 'background')

describe('contraste do texto sobre o holográfico', () => {
  it('a opacidade do brilho vem de um token e não passa de 0,3', () => {
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThanOrEqual(0.3)
  })

  it.each([
    { theme: 'claro', tokens: claro },
    { theme: 'escuro', tokens: escuro },
  ])('tema $theme: com a cor mais clara do brilho por cima, o texto mantém 4,5:1', ({ tokens }) => {
    const brightest = glowTokens
      .map((token) => tokens[token])
      .sort((a, b) => contrast(b, '#000000') - contrast(a, '#000000'))[0]
    const worstBackground = blend(tokens[backgroundToken], brightest, alpha)

    expect(contrast(tokens[textToken], worstBackground)).toBeGreaterThanOrEqual(4.5)
  })
})
