import { describe, expect, it } from 'vitest'
import {
  contrast,
  declarationsOf,
  resolveColor,
  ruleBody,
  tokensOf,
  tokensUsedIn,
  tokenUsed,
} from '../test/css'
import cena from './cena.css?raw'
import base from './rodoviaria.css?raw'

if (cena.length === 0 || base.length === 0) {
  throw new Error('CSS veio vazio: confira test.css.include no vite.config.ts')
}

const claro = tokensOf(ruleBody(base, ':root'))
const escuro = { ...claro, ...tokensOf(ruleBody(base, ":root[data-tema='escuro']")) }
const sceneTokens = declarationsOf(ruleBody(cena, ':root'))
const skyTokens = tokensUsedIn(ruleBody(cena, '.cena'), 'background')
const titleToken = tokenUsed(ruleBody(cena, '.cena-conteudo'), 'color')

const REDUCED = '@media (prefers-reduced-motion: reduce)'
const beforeReduced = cena.slice(0, cena.indexOf(REDUCED))
const reduced = cena.slice(cena.indexOf(REDUCED))

/** Corpo de cada @keyframes, com as chaves de dentro já contadas. */
function keyframesBodies(css: string): Record<string, string> {
  const bodies: Record<string, string> = {}
  for (const match of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1
    let end = match.index + match[0].length
    while (depth > 0) {
      depth += css[end] === '{' ? 1 : css[end] === '}' ? -1 : 0
      end++
    }
    bodies[match[1]] = css.slice(match.index + match[0].length, end - 1)
  }
  return bodies
}

const seconds = (selector: string) =>
  Number(ruleBody(cena, selector).match(/animation-duration:\s*([\d.]+)s/)?.[1])

describe('CSS da cena: movimento', () => {
  it('define a animação cena-anda e a regra de movimento reduzido', () => {
    expect(keyframesBodies(cena)).toHaveProperty('cena-anda')
    expect(cena).toContain(REDUCED)
  })

  it('com movimento reduzido, toda classe que anima é desligada', () => {
    const animated = [...beforeReduced.matchAll(/(\.[\w-]+)\s*\{[^}]*\banimation:/g)].map(
      (match) => match[1],
    )

    expect(animated.length).toBeGreaterThanOrEqual(4)
    for (const selector of animated) {
      expect(reduced, selector).toContain(selector)
    }
    expect(reduced).toMatch(/animation:\s*none/)
  })

  it('só anima transform', () => {
    const bodies = Object.entries(keyframesBodies(cena))

    expect(bodies.length).toBeGreaterThanOrEqual(3)
    for (const [name, body] of bodies) {
      const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1])
      expect(new Set(properties), name).toEqual(new Set(['transform']))
    }
  })

  it('não usa transition: all e só pede will-change de transform', () => {
    expect(cena).not.toMatch(/transition:\s*all/)
    const hints = [...cena.matchAll(/will-change:\s*([^;]+);/g)].map((match) => match[1].trim())
    expect(hints.length).toBeGreaterThan(0)
    expect(new Set(hints)).toEqual(new Set(['transform']))
  })

  it('quanto mais perto da câmera, mais rápida a camada (paralaxe)', () => {
    const mountains = seconds('.cena-montanha')
    const buildings = seconds('.cena-predio')
    const trees = seconds('.cena-arvore')
    const front = seconds('.cena-frente')
    const road = Number(
      ruleBody(cena, '.cena-faixa').match(/animation:\s*cena-anda\s+([\d.]+)s/)?.[1],
    )

    expect(mountains).toBeGreaterThan(buildings)
    expect(buildings).toBeGreaterThan(trees)
    expect(trees).toBeGreaterThan(front)
    expect(front).toBeGreaterThan(road)
  })
})

describe('CSS da cena: cores', () => {
  it('nenhuma cor fixa: tudo vem de variável de tema', () => {
    expect(cena).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(cena).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
  })

  it.each([
    { theme: 'claro', tokens: claro },
    { theme: 'escuro', tokens: escuro },
  ])('tema $theme: o título tem 4,5:1 sobre todo o céu', ({ tokens }) => {
    const all = { ...tokens, ...sceneTokens }
    const title = resolveColor(`var(${titleToken})`, all)

    expect(skyTokens.length).toBeGreaterThanOrEqual(2)
    for (const token of skyTokens) {
      const sky = resolveColor(`var(${token})`, all)
      expect(contrast(title, sky), token).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('CSS da cena: botão de pausa', () => {
  it('com data-pausada, toda classe que anima fica em pausa', () => {
    const animated = [...beforeReduced.matchAll(/(\.[\w-]+)\s*\{[^}]*\banimation:/g)].map(
      (match) => match[1],
    )
    const rule = cena.match(/([^{}]*\.cena\[data-pausada\][^{}]*)\{([^}]*)\}/)

    expect(animated.length).toBeGreaterThanOrEqual(4)
    expect(rule).not.toBeNull()
    expect(rule?.[2]).toMatch(/animation-play-state:\s*paused/)
    for (const selector of animated) {
      expect(rule?.[1], selector).toContain(`.cena[data-pausada] ${selector}`)
    }
  })

  it('o alvo de toque tem pelo menos 44 px de altura', () => {
    expect(ruleBody(cena, '.cena-pausa')).toMatch(/min-height:\s*2\.75rem/)
  })

  it.each([
    { theme: 'claro', tokens: claro },
    { theme: 'escuro', tokens: escuro },
  ])('tema $theme: o texto do botão tem 4,5:1 sobre o fundo dele', ({ tokens }) => {
    const body = ruleBody(cena, '.cena-pausa')
    const all = { ...tokens, ...sceneTokens }
    const text = resolveColor(`var(${tokenUsed(body, 'color')})`, all)
    const background = resolveColor(`var(${tokenUsed(body, 'background')})`, all)

    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5)
  })
})
