export type Tokens = Record<string, string>

/** Corpo (entre as chaves) da primeira regra com exatamente este seletor. */
export function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) {
    throw new Error(`Regra não encontrada no CSS: ${selector}`)
  }
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

/** Tokens de cor em hexadecimal declarados no corpo de uma regra. */
export function tokensOf(body: string): Tokens {
  const tokens: Tokens = {}
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name] = value
  }
  return tokens
}

/** Nome do token usado por `var(--token)` na declaração da propriedade. */
export function tokenUsed(body: string, property: string): string {
  const match = body.match(new RegExp(`${property}:[^;]*var\\((--[\\w-]+)\\)`))
  if (!match) {
    throw new Error(`A propriedade ${property} não usa um token de cor`)
  }
  return match[1]
}

/** Todos os tokens usados por `var(--token)` na declaração da propriedade (gradientes). */
export function tokensUsedIn(body: string, property: string): string[] {
  const declaration = body.match(new RegExp(`${property}:([^;]*);`))
  if (!declaration) {
    throw new Error(`A propriedade ${property} não existe na regra`)
  }
  return Array.from(declaration[1].matchAll(/var\((--[\w-]+)\)/g), (match) => match[1])
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ]
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razão de contraste da WCAG entre duas cores em hexadecimal. */
export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Cor resultante de pôr `top` com opacidade `alpha` por cima de `base`. */
export function blend(base: string, top: string, alpha: number): string {
  const mixed = channels(base).map((value, index) =>
    Math.round(value * (1 - alpha) + channels(top)[index] * alpha),
  )
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/** Todas as declarações `--nome: valor;` do corpo de uma regra, com o valor como texto. */
export function declarationsOf(body: string): Tokens {
  const declarations: Tokens = {}
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    declarations[name] = value.trim()
  }
  return declarations
}

/** Resolve `#hex`, `var(--token)` e `color-mix(in srgb, A p%, B)` até uma cor em hexadecimal. */
export function resolveColor(value: string, tokens: Tokens): string {
  const text = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text
  }
  const reference = text.match(/^var\((--[\w-]+)\)$/)
  if (reference) {
    const next = tokens[reference[1]]
    if (next === undefined) {
      throw new Error(`Token sem valor: ${reference[1]}`)
    }
    return resolveColor(next, tokens)
  }
  const mix = text.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+)\)$/)
  if (mix) {
    const [, first, percent, second] = mix
    return blend(
      resolveColor(first, tokens),
      resolveColor(second, tokens),
      1 - Number(percent) / 100,
    )
  }
  throw new Error(`Cor não suportada pelo teste: ${text}`)
}
