import { describe, expect, it } from 'vitest'
import { contrast, ruleBody, tokensOf } from '../test/css'
import assentos from './assentos.css?raw'
import base from './rodoviaria.css?raw'

if (assentos.length === 0 || base.length === 0) {
  throw new Error('CSS veio vazio: confira test.css.include no vite.config.ts')
}

const claro = tokensOf(ruleBody(base, ':root'))
const escuro = { ...claro, ...tokensOf(ruleBody(base, ":root[data-tema='escuro']")) }

const STATES = ['livre', 'selecionado', 'reservado', 'ocupado'] as const
const box = (state: string) => ruleBody(assentos, `.assento[data-estado='${state}'] .assento-caixa`)

/** Token de `var(--x)` na propriedade exata (sem confundir `color` com `border-color`). */
function tokenOf(body: string, property: string): string {
  const match = body.match(new RegExp(`(?:^|[\\s;])${property}:\\s*var\\((--[\\w-]+)\\)`))
  if (!match) {
    throw new Error(`A propriedade ${property} não usa um token de cor`)
  }
  return match[1]
}

describe.each([
  ['claro', claro],
  ['escuro', escuro],
])('CSS dos assentos: contraste no tema %s', (_theme, tokens) => {
  it.each(STATES)('o número do assento %s tem 4,5:1 sobre o fundo', (state) => {
    const body = box(state)
    const text = tokens[tokenOf(body, 'color')]
    const background = tokens[tokenOf(body, 'background')]

    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['livre', 'selecionado', 'reservado'] as const)(
    'a borda do assento %s tem 3:1 sobre o quadro',
    (state) => {
      const border = tokens[tokenOf(box(state), 'border-color')]

      expect(contrast(border, tokens['--quadro'])).toBeGreaterThanOrEqual(3)
    },
  )
})

describe('CSS dos assentos: forma e comportamento', () => {
  it('o alvo de toque tem pelo menos 44 px (2,75rem) nas duas medidas', () => {
    const body = ruleBody(assentos, '.assento-caixa')
    const size = (property: string) =>
      Number(body.match(new RegExp(`${property}:\\s*([\\d.]+)rem`))?.[1])

    expect(size('width')).toBeGreaterThanOrEqual(2.75)
    expect(size('height')).toBeGreaterThanOrEqual(2.75)
  })

  it('reservado e ocupado se distinguem também pela borda, não só pela cor', () => {
    expect(box('reservado')).toMatch(/border-style:\s*dashed/)
    expect(box('ocupado')).toMatch(/border-style:\s*solid/)
  })

  it('o radio fica invisível mas continua focável (sem display:none nem visibility:hidden)', () => {
    const body = ruleBody(assentos, '.assento input')

    expect(body).toMatch(/position:\s*absolute/)
    expect(body).toMatch(/opacity:\s*0/)
    expect(body).not.toMatch(/display:\s*none|visibility:\s*hidden/)
  })

  it('o foco do teclado aparece na caixa do assento, com o token de foco', () => {
    const body = ruleBody(assentos, '.assento input:focus-visible + .assento-caixa')

    expect(body).toMatch(/outline:[^;]*var\(--foco\)/)
  })

  it('não tem cor fixa: tudo vem dos tokens', () => {
    expect(assentos).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  })

  it('não anima nada e não usa transition: all', () => {
    expect(assentos).not.toMatch(/animation|transition/)
  })

  it('hover só dentro de @media (hover: hover)', () => {
    const media = assentos.indexOf('@media (hover: hover)')
    const hovers = [...assentos.matchAll(/:hover/g)].map((match) => match.index)

    for (const index of hovers) {
      expect(media).toBeGreaterThanOrEqual(0)
      expect(index).toBeGreaterThan(media)
    }
  })
})
