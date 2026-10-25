import { describe, expect, it } from 'vitest'
import css from './rodoviaria.css?raw'

if (css.length === 0) {
  throw new Error('rodoviaria.css veio vazio: confira test.css.include no vite.config.ts')
}

type Tokens = Record<string, string>

/** Corpo (entre as chaves) da primeira regra com exatamente este seletor. */
function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) {
    throw new Error(`Regra não encontrada no CSS: ${selector}`)
  }
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

/** Tokens de cor em hexadecimal declarados no corpo de uma regra. */
function tokensOf(body: string): Tokens {
  const tokens: Tokens = {}
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name] = value
  }
  return tokens
}

/** Nome do token usado por `var(--token)` na declaração da propriedade. */
function tokenUsed(body: string, property: string): string {
  const match = body.match(new RegExp(`${property}:[^;]*var\\((--[\\w-]+)\\)`))
  if (!match) {
    throw new Error(`A propriedade ${property} não usa um token de cor`)
  }
  return match[1]
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razão de contraste da WCAG entre duas cores em hexadecimal. */
function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

const claro = tokensOf(ruleBody(':root'))
const escuro = { ...claro, ...tokensOf(ruleBody(":root[data-tema='escuro']")) }
const borderToken = tokenUsed(ruleBody('.botao-tema'), 'border')
const backgroundToken = tokenUsed(ruleBody('.topo'), 'background')

describe('contraste do botão de tema', () => {
  it.each([
    { theme: 'claro', tokens: claro },
    { theme: 'escuro', tokens: escuro },
  ])('tema $theme: a borda tem pelo menos 3:1 contra o fundo do topo', ({ tokens }) => {
    const ratio = contrast(tokens[borderToken], tokens[backgroundToken])
    expect(ratio).toBeGreaterThanOrEqual(3)
  })
})
