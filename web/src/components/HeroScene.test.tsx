import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HeroScene from './HeroScene'

function renderScene() {
  const view = render(<HeroScene title="Para onde você vai?" />)
  const scene = view.container.querySelector<HTMLElement>('[data-cena]')
  if (!scene) {
    throw new Error('A cena precisa ter o atributo data-cena')
  }
  return { ...view, scene }
}

describe('HeroScene', () => {
  it('mostra o título como h1, fora da camada decorativa', () => {
    renderScene()

    const title = screen.getByRole('heading', { level: 1, name: 'Para onde você vai?' })
    expect(title.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('a camada decorativa é aria-hidden, sem texto e sem nada que receba foco', () => {
    const { scene } = renderScene()

    const hidden = scene.querySelectorAll('[aria-hidden="true"]')
    expect(hidden).toHaveLength(1)
    expect(hidden[0].textContent).toBe('')
    expect(
      hidden[0].querySelectorAll('a, button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0)
  })

  it('não usa vídeo, imagem nem endereço externo', () => {
    const { scene } = renderScene()

    expect(scene.querySelector('video, img, image, picture, canvas')).toBeNull()
    expect(scene.innerHTML).not.toMatch(/https?:|url\(/)
  })

  it('as cores não vêm de atributos do SVG: só do CSS, por variável de tema', () => {
    const { scene } = renderScene()

    expect(scene.querySelectorAll('[fill], [stroke], [style]')).toHaveLength(0)
  })

  it('cada camada tem dois blocos iguais de 1200 px (o laço não tem salto)', () => {
    const { scene } = renderScene()

    const layers = scene.querySelectorAll('.cena-camada')
    expect(layers).toHaveLength(4)
    for (const layer of layers) {
      const tiles = layer.querySelectorAll(':scope > svg')
      expect(tiles).toHaveLength(2)
      expect(tiles[0].innerHTML).toBe(tiles[1].innerHTML)
      expect(tiles[0].getAttribute('width')).toBe('1200')
      expect(tiles[0].getAttribute('viewBox')?.split(' ')[2]).toBe('1200')
    }
  })

  it('as camadas vão do fundo para a frente: montanhas, prédios, árvores e postes', () => {
    const { scene } = renderScene()

    const names = Array.from(scene.querySelectorAll('.cena-camada'), (layer) =>
      layer.className.replace('cena-camada ', ''),
    )
    expect(names).toEqual(['cena-montanha', 'cena-predio', 'cena-arvore', 'cena-frente'])
  })

  it('o ônibus tem duas rodas que giram e uma estrada com faixa', () => {
    const { scene } = renderScene()

    expect(scene.querySelectorAll('.cena-roda')).toHaveLength(2)
    expect(scene.querySelector('.cena-estrada .cena-faixa')).not.toBeNull()
  })
})
