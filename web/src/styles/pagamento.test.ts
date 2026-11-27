import { describe, expect, it } from 'vitest'
import { contrast, ruleBody, tokensOf, tokenUsed } from '../test/css'
import pagamento from './pagamento.css?raw'
import base from './rodoviaria.css?raw'

if (pagamento.length === 0 || base.length === 0) {
  throw new Error('CSS veio vazio: confira test.css.include no vite.config.ts')
}

const claro = tokensOf(ruleBody(base, ':root'))
const escuro = { ...claro, ...tokensOf(ruleBody(base, ":root[data-tema='escuro']")) }

/** Texto sobre fundo: o par (cor do texto, cor do fundo) de uma regra, como nomes de token. */
const PAIRS = [
  ['.pix', 'color', 'background'],
  ['.pix-selo', 'color', 'background'],
  ['.pix-codigo', 'color', 'background'],
  ['.pay-aviso', 'color', 'background'],
] as const

describe.each([
  ['claro', claro],
  ['escuro', escuro],
])('CSS do pagamento: contraste no tema %s', (_theme, tokens) => {
  it.each(PAIRS)('%s: o texto tem 4,5:1 sobre o próprio fundo', (selector, text, background) => {
    const body = ruleBody(pagamento, selector)

    expect(
      contrast(tokens[tokenUsed(body, text)], tokens[tokenUsed(body, background)]),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['.pagamento time', 'color'],
    ['.pay-demo legend', 'color'],
    ['.confirmada h2', 'color'],
  ])('%s: a cor tem 4,5:1 sobre o quadro', (selector, property) => {
    const color = tokens[tokenUsed(ruleBody(pagamento, selector), property)]

    expect(contrast(color, tokens['--quadro'])).toBeGreaterThanOrEqual(4.5)
  })

  it('a borda tracejada do Pix tem 3:1 sobre o quadro', () => {
    const border = tokens[tokenUsed(ruleBody(pagamento, '.pix'), 'border')]

    expect(contrast(border, tokens['--quadro'])).toBeGreaterThanOrEqual(3)
  })

  it.each([
    ['.pay-opcao input', 'border'],
    ['.pay-opcao input:checked', 'border-color'],
    ['.pay-opcao input::before', 'background'],
  ])('radio %s: a cor de %s tem 3:1 sobre o quadro', (selector, property) => {
    const color = tokens[tokenUsed(ruleBody(pagamento, selector), property)]

    expect(contrast(color, tokens['--quadro'])).toBeGreaterThanOrEqual(3)
  })
})

describe('CSS do pagamento: forma e comportamento', () => {
  it('cada opção do modo demonstração tem pelo menos 44 px de altura', () => {
    expect(ruleBody(pagamento, '.pay-opcao')).toMatch(/min-height:\s*44px/)
  })

  it('o radio desenhado continua um input focável (sem display:none, visibility:hidden nem opacity:0)', () => {
    const body = ruleBody(pagamento, '.pay-opcao input')

    expect(body).toMatch(/appearance:\s*none/)
    expect(body).not.toMatch(/display:\s*none|visibility:\s*hidden|opacity:\s*0\b/)
  })

  it('o radio marcado se distingue também pela forma: aparece um ponto, não só outra cor', () => {
    expect(ruleBody(pagamento, '.pay-opcao input::before')).toMatch(/display:\s*none/)
    expect(ruleBody(pagamento, '.pay-opcao input:checked::before')).toMatch(/display:\s*block/)
  })

  it('o Pix se distingue de um pagamento de verdade também pela borda tracejada', () => {
    expect(ruleBody(pagamento, '.pix')).toMatch(/border:\s*2px dashed/)
  })

  it('o contador usa números de largura fixa, para o tempo não tremer ao descer', () => {
    expect(ruleBody(pagamento, '.pagamento time')).toMatch(/tabular-nums/)
  })

  it('não tem cor fixa: tudo vem dos tokens', () => {
    expect(pagamento).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  })

  it('não anima nada, então não há o que reduzir com prefers-reduced-motion', () => {
    expect(pagamento).not.toMatch(/animation|transition|@keyframes/)
  })
})
