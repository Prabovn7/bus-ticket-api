import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import gsap from 'gsap'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { mockMediaQueries } from '../test/motion'
import HoloCard from './HoloCard'

const REDUCED = '(prefers-reduced-motion: reduce)'
const NO_HOVER = '(hover: none)'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// O jsdom não calcula layout: o cartão tem 200 x 100 px por combinação.
function renderCard(element = <HoloCard>Pagamentos simulados</HoloCard>) {
  const view = render(element)
  const card = view.container.querySelector<HTMLElement>('[data-holo]')
  if (!card) {
    throw new Error('O HoloCard precisa ter o atributo data-holo')
  }
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 100,
    width: 200,
    height: 100,
    toJSON: () => ({}),
  })
  return { ...view, card }
}

function point(card: HTMLElement, x: number, y: number, pointerType = 'mouse') {
  fireEvent.pointerMove(card, { clientX: x, clientY: y, pointerType })
}

const glow = (card: HTMLElement) => ({
  x: parseFloat(card.style.getPropertyValue('--mx')),
  y: parseFloat(card.style.getPropertyValue('--my')),
})

const tilt = (card: HTMLElement) => ({
  x: Number(gsap.getProperty(card, 'rotationX')),
  y: Number(gsap.getProperty(card, 'rotationY')),
})

describe('HoloCard', () => {
  it('mostra o conteúdo em texto normal e esconde a camada de brilho', () => {
    const { container } = renderCard()

    expect(screen.getByText('Pagamentos simulados')).toBeInTheDocument()
    const layer = container.querySelector('[aria-hidden="true"]')
    expect(layer).not.toBeNull()
    expect(layer).toBeEmptyDOMElement()
  })

  it('o brilho segue o ponteiro', async () => {
    const { card } = renderCard()

    point(card, 50, 25)

    await waitFor(() => {
      expect(glow(card).x).toBeCloseTo(25, 0)
      expect(glow(card).y).toBeCloseTo(25, 0)
    })
  })

  it('inclina para o lado do ponteiro e nunca passa de 8 graus, nem com o ponteiro longe', async () => {
    const { card } = renderCard()

    point(card, 1000, 1000)

    await waitFor(() => expect(tilt(card).y).toBeCloseTo(8, 1))
    expect(tilt(card).x).toBeCloseTo(-8, 1)

    point(card, -500, -500)

    await waitFor(() => expect(tilt(card).y).toBeCloseTo(-8, 1))
    expect(tilt(card).x).toBeCloseTo(8, 1)
  })

  it('no toque, o brilho segue o dedo mas o cartão não inclina', async () => {
    const { card } = renderCard()

    point(card, 50, 25, 'touch')

    await waitFor(() => expect(glow(card).x).toBeCloseTo(25, 0))
    await wait(400)
    expect(tilt(card)).toEqual({ x: 0, y: 0 })
  })

  it('ao sair, o brilho e a inclinação voltam ao centro', async () => {
    const { card } = renderCard()
    point(card, 200, 100)
    await waitFor(() => expect(tilt(card).y).toBeCloseTo(8, 1))

    fireEvent.pointerLeave(card, { pointerType: 'mouse' })

    await waitFor(() => {
      expect(tilt(card).y).toBeCloseTo(0, 1)
      expect(tilt(card).x).toBeCloseTo(0, 1)
      expect(glow(card)).toEqual({ x: 50, y: 50 })
    })
  })

  it('com movimento reduzido, o cartão não ganha estilo nem reage ao ponteiro', async () => {
    mockMediaQueries({ [REDUCED]: true })
    const { card } = renderCard()

    point(card, 50, 25)
    await wait(400)

    expect(card.getAttribute('style')).toBeNull()
  })

  it('em tela com mouse, o brilho fica parado até o ponteiro chegar', async () => {
    const { card } = renderCard()

    await wait(600)

    expect(glow(card)).toEqual({ x: 50, y: 50 })
  })

  it('em tela sem hover, o brilho passeia sozinho', async () => {
    mockMediaQueries({ [NO_HOVER]: true })
    const { card } = renderCard()
    const seen = new Set<number>()
    const observer = new MutationObserver(() => seen.add(glow(card).x))
    observer.observe(card, { attributes: true, attributeFilter: ['style'] })

    await waitFor(() => expect(seen.size).toBeGreaterThanOrEqual(2), { timeout: 1500 })
    observer.disconnect()
  })

  it('em tela sem hover e com movimento reduzido, nada passeia', async () => {
    mockMediaQueries({ [NO_HOVER]: true, [REDUCED]: true })
    const { card } = renderCard()

    await wait(600)

    expect(card.getAttribute('style')).toBeNull()
  })

  it('no StrictMode há uma só camada de brilho e o ponteiro continua funcionando', async () => {
    const { container, card } = renderCard(
      <StrictMode>
        <HoloCard>Pagamentos simulados</HoloCard>
      </StrictMode>,
    )

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
    point(card, 50, 25)
    await waitFor(() => expect(glow(card).x).toBeCloseTo(25, 0))
  })
})
