import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import { mockMotionPreference } from '../test/motion'
import FlapTime from './FlapTime'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** O que as folhas mostram agora: o grupo aria-hidden, que o leitor de tela ignora. */
function flapsText(container: HTMLElement): string | undefined {
  return container.querySelector('[aria-hidden="true"]')?.textContent ?? undefined
}

/** Anota o que as folhas mostraram a cada mudança do DOM, para ver os números intermediários. */
function watchFlaps(container: HTMLElement) {
  const seen: (string | undefined)[] = []
  const observer = new MutationObserver(() => seen.push(flapsText(container)))
  observer.observe(container, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })
  return { seen, stop: () => observer.disconnect() }
}

describe('FlapTime', () => {
  it('expõe o horário uma única vez, em texto acessível', () => {
    render(<FlapTime value="08:00" />)
    expect(screen.getByText('08:00')).toBeInTheDocument()
  })

  it('esconde as folhas dos leitores de tela', () => {
    const { container } = render(<FlapTime value="08:00" />)
    const flaps = container.querySelector('[aria-hidden="true"]')
    expect(flaps).not.toBeNull()
    expect(flaps).not.toContainElement(screen.getByText('08:00'))
  })

  it('com movimento reduzido, mostra só o valor final, sem números intermediários', async () => {
    mockMotionPreference(true)
    const { container } = render(<FlapTime value="08:00" />)
    const watcher = watchFlaps(container)

    expect(flapsText(container)).toBe('08:00')
    await wait(400)
    watcher.stop()

    expect(watcher.seen.every((text) => text === '08:00')).toBe(true)
    expect(flapsText(container)).toBe('08:00')
  })

  it('sem movimento reduzido, passa por números intermediários e termina em até 1 s', async () => {
    const { container } = render(<FlapTime value="08:00" />)
    const watcher = watchFlaps(container)

    await waitFor(() => expect(watcher.seen.some((text) => text !== '08:00')).toBe(true), {
      timeout: 1000,
    })
    await waitFor(() => expect(flapsText(container)).toBe('08:00'), { timeout: 1000 })
    watcher.stop()
  })

  it('ao mudar o valor, o texto acessível muda na hora e as folhas terminam no novo horário', async () => {
    const { container, rerender } = render(<FlapTime value="08:00" />)
    await wait(1100)

    rerender(<FlapTime value="09:30" />)

    expect(screen.getByText('09:30')).toBeInTheDocument()
    await waitFor(() => expect(flapsText(container)).toBe('09:30'), { timeout: 1000 })
  })

  it('no StrictMode não duplica o texto acessível nem deixa animação sobrando', async () => {
    const { container } = render(
      <StrictMode>
        <FlapTime value="08:00" />
      </StrictMode>,
    )

    expect(screen.getAllByText('08:00')).toHaveLength(1)
    await wait(1100)
    expect(flapsText(container)).toBe('08:00')
  })
})
