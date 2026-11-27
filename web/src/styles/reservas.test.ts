import { describe, expect, it } from 'vitest'
import { contrast, ruleBody, tokensOf, tokenUsed } from '../test/css'
import base from './rodoviaria.css?raw'
import reservas from './reservas.css?raw'

if (reservas.length === 0 || base.length === 0) {
  throw new Error('CSS veio vazio: confira test.css.include no vite.config.ts')
}

const claro = tokensOf(ruleBody(base, ':root'))
const escuro = { ...claro, ...tokensOf(ruleBody(base, ":root[data-tema='escuro']")) }

const STATUSES = ['held', 'paid', 'cancelled', 'expired']

/** Texto sobre fundo: o par (cor do texto, cor do fundo) de uma regra, como nomes de token. */
const PAIRS = [
  ['.reserva'],
  ['.reserva-status'],
  ...STATUSES.map((status) => [`.reserva-status-${status}`]),
  ['.reserva-botao-perigo'],
  ['.reserva-confirmacao'],
]

describe.each([
  ['claro', claro],
  ['escuro', escuro],
])('CSS das reservas: contraste no tema %s', (_theme, tokens) => {
  it.each(PAIRS)('%s: o texto tem 4,5:1 sobre o próprio fundo', (selector) => {
    const body = ruleBody(reservas, selector)

    expect(
      contrast(tokens[tokenUsed(body, 'color')], tokens[tokenUsed(body, 'background')]),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each([['.reserva-viagem'], ['.reserva-botao'], ['.reserva-botao-cancelar']])(
    '%s: o texto tem 4,5:1 sobre o cartão',
    (selector) => {
      const color = tokens[tokenUsed(ruleBody(reservas, selector), 'color')]

      expect(contrast(color, tokens['--superficie'])).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each([
    ['.reserva-botao-cancelar:hover', '.reserva-botao-cancelar'],
    ['.reserva-botao-voltar:hover', '.reserva-botao'],
  ])('%s: com o fundo do hover, o texto continua com 4,5:1', (hover, owner) => {
    const color = tokens[tokenUsed(ruleBody(reservas, owner), 'color')]
    const background = tokens[tokenUsed(ruleBody(reservas, hover), 'background')]

    expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['.reserva-botao', 'border'],
    ['.reserva-botao-cancelar', 'border'],
    ['.reserva-confirmacao', 'border-left'],
  ])('%s: a cor de %s tem 3:1 sobre o cartão', (selector, property) => {
    const color = tokens[tokenUsed(ruleBody(reservas, selector), property)]

    expect(contrast(color, tokens['--superficie'])).toBeGreaterThanOrEqual(3)
  })
})

describe('CSS das reservas: forma e comportamento', () => {
  it.each(STATUSES)('o status %s tem um selo próprio', (status) => {
    expect(() => ruleBody(reservas, `.reserva-status-${status}`)).not.toThrow()
  })

  it('os quatro selos diferem entre si, para o estado não depender só do texto', () => {
    const looks = STATUSES.map((status) => {
      const body = ruleBody(reservas, `.reserva-status-${status}`)
      return `${tokenUsed(body, 'background')}/${tokenUsed(body, 'color')}`
    })

    expect(new Set(looks).size).toBe(STATUSES.length)
  })

  it('os botões têm pelo menos 44 px de altura', () => {
    expect(ruleBody(reservas, '.reserva-botao')).toMatch(/min-height:\s*44px/)
  })

  it('o botão desabilitado se distingue e mostra o cursor de bloqueio', () => {
    const body = ruleBody(reservas, '.reserva-botao:disabled')

    expect(body).toMatch(/opacity:\s*0\.6/)
    expect(body).toMatch(/cursor:\s*not-allowed/)
  })

  it('a região de aviso vazia não soma o espaço do cartão (margem igual ao gap) e não some da página', () => {
    expect(ruleBody(reservas, '.reserva')).toMatch(/gap:\s*0\.5rem/)
    expect(ruleBody(reservas, '.reserva-aviso:empty')).toMatch(/margin-top:\s*-0\.5rem/)
    expect(reservas).not.toMatch(/display:\s*none/)
  })

  it('o preço usa números de largura fixa, para os valores alinharem entre os cartões', () => {
    expect(ruleBody(reservas, '.reserva-preco')).toMatch(/tabular-nums/)
  })

  it('o hover só vale em tela com mouse', () => {
    const outsideHover = reservas.split('@media (hover: hover)')[0]

    expect(reservas).toMatch(/@media \(hover: hover\)/)
    expect(outsideHover).not.toMatch(/:hover/)
  })

  it('não tem cor fixa: tudo vem dos tokens', () => {
    expect(reservas).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  })

  it('não anima nada, então não há o que reduzir com prefers-reduced-motion', () => {
    expect(reservas).not.toMatch(/animation|transition|@keyframes/)
  })
})
