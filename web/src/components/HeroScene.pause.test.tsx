import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockMotionPreference } from '../test/motion'
import HeroScene from './HeroScene'

function renderScene() {
  const view = render(<HeroScene title="Para onde você vai?" />)
  const scene = view.container.querySelector<HTMLElement>('[data-cena]')
  if (!scene) {
    throw new Error('A cena precisa ter o atributo data-cena')
  }
  return { ...view, scene }
}

const pauseButton = () => screen.getByRole('button', { name: 'Pausar animação' })

describe('HeroScene: pausa da animação (WCAG 2.2.2)', () => {
  it('oferece o botão Pausar animação, solto e fora da camada decorativa', () => {
    renderScene()

    const button = pauseButton()
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('clicar pausa e clicar de novo retoma, sem trocar o nome do botão', async () => {
    const user = userEvent.setup()
    const { scene } = renderScene()

    expect(scene).not.toHaveAttribute('data-pausada')

    await user.click(pauseButton())
    expect(pauseButton()).toHaveAttribute('aria-pressed', 'true')
    expect(scene).toHaveAttribute('data-pausada')

    await user.click(pauseButton())
    expect(pauseButton()).toHaveAttribute('aria-pressed', 'false')
    expect(scene).not.toHaveAttribute('data-pausada')
  })

  it('funciona pelo teclado, com Enter e com Espaço', async () => {
    const user = userEvent.setup()
    const { scene } = renderScene()

    await user.tab()
    expect(pauseButton()).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(scene).toHaveAttribute('data-pausada')

    await user.keyboard(' ')
    expect(scene).not.toHaveAttribute('data-pausada')
  })

  it('vem depois do título na ordem do documento', () => {
    renderScene()

    const title = screen.getByRole('heading', { level: 1 })
    expect(
      title.compareDocumentPosition(pauseButton()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('com movimento reduzido não há o que pausar: o botão não aparece', () => {
    mockMotionPreference(true)
    renderScene()

    expect(screen.queryByRole('button', { name: 'Pausar animação' })).toBeNull()
  })
})
