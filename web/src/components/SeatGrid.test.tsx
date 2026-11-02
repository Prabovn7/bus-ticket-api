import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Seat } from '../api/types'
import SeatGrid from './SeatGrid'

const HELD = 5
const TAKEN = 6

function seatsOf(count = 40): Seat[] {
  return Array.from({ length: count }, (_, index) => {
    const seat_number = index + 1
    const status = seat_number === HELD ? 'held' : seat_number === TAKEN ? 'taken' : 'free'
    return { seat_number, status }
  })
}

function Harness({ seats }: { seats: Seat[] }) {
  const [selected, setSelected] = useState<number | null>(null)
  return <SeatGrid seats={seats} selected={selected} onSelect={setSelected} />
}

const radio = (name: string) => screen.getByRole('radio', { name })

describe('SeatGrid', () => {
  it('é um grupo "Escolha seu assento" com um radio por assento', () => {
    render(<SeatGrid seats={seatsOf()} selected={null} onSelect={() => {}} />)

    const group = screen.getByRole('group', { name: 'Escolha seu assento' })
    expect(within(group).getAllByRole('radio')).toHaveLength(40)
  })

  it('monta fileiras de 2 + corredor + 2', () => {
    const { container } = render(<SeatGrid seats={seatsOf()} selected={null} onSelect={() => {}} />)

    const rows = container.querySelectorAll('.fileira')
    expect(rows).toHaveLength(10)
    for (const row of rows) {
      const kinds = Array.from(row.children, (child) =>
        child.classList.contains('corredor') ? 'corredor' : 'assento',
      )
      expect(kinds).toEqual(['assento', 'assento', 'corredor', 'assento', 'assento'])
      expect(row.querySelector('.corredor')).toHaveAttribute('aria-hidden', 'true')
    }
    expect(rows[0]?.textContent).toBe('1234')
  })

  it('aceita uma última fileira incompleta', () => {
    const { container } = render(
      <SeatGrid seats={seatsOf(6)} selected={null} onSelect={() => {}} />,
    )

    expect(screen.getAllByRole('radio')).toHaveLength(6)
    expect(container.querySelectorAll('.fileira')).toHaveLength(2)
  })

  it('o nome acessível diz o número e a situação do assento', () => {
    render(<SeatGrid seats={seatsOf()} selected={null} onSelect={() => {}} />)

    expect(radio('Assento 1, livre')).toBeInTheDocument()
    expect(radio('Assento 5, reservado por outra pessoa')).toBeInTheDocument()
    expect(radio('Assento 6, ocupado')).toBeInTheDocument()
  })

  it('só os assentos livres podem ser escolhidos', () => {
    render(<SeatGrid seats={seatsOf()} selected={null} onSelect={() => {}} />)

    expect(radio('Assento 1, livre')).toBeEnabled()
    expect(radio('Assento 5, reservado por outra pessoa')).toBeDisabled()
    expect(radio('Assento 6, ocupado')).toBeDisabled()
  })

  it('marca só o assento selecionado', () => {
    const { container } = render(<SeatGrid seats={seatsOf()} selected={7} onSelect={() => {}} />)

    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
    expect(radio('Assento 7, livre')).toBeChecked()
    expect(container.querySelector('[data-estado="selecionado"]')).toHaveTextContent('7')
    expect(container.querySelectorAll('[data-estado="livre"]')).toHaveLength(37)
    expect(container.querySelectorAll('[data-estado="reservado"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-estado="ocupado"]')).toHaveLength(1)
  })

  it('clicar num assento livre chama onSelect com o número', async () => {
    const onSelect = vi.fn()
    render(<SeatGrid seats={seatsOf()} selected={null} onSelect={onSelect} />)

    await userEvent.click(radio('Assento 7, livre'))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(7)
  })

  it('clicar num assento reservado ou ocupado não chama onSelect', async () => {
    const onSelect = vi.fn()
    render(<SeatGrid seats={seatsOf()} selected={null} onSelect={onSelect} />)

    await userEvent.click(radio('Assento 5, reservado por outra pessoa'))
    await userEvent.click(radio('Assento 6, ocupado'))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('o teclado entra na grade com um Tab e as setas pulam os assentos indisponíveis', async () => {
    render(<Harness seats={seatsOf()} />)
    const user = userEvent.setup()

    await user.tab()
    expect(radio('Assento 1, livre')).toHaveFocus()

    await user.click(radio('Assento 4, livre'))
    await user.keyboard('{ArrowRight}')

    expect(radio('Assento 7, livre')).toBeChecked()
    expect(radio('Assento 7, livre')).toHaveFocus()
  })

  it('as marcas ficam escondidas do leitor e a reserva e a ocupação se distinguem sem cor', () => {
    const { container } = render(<SeatGrid seats={seatsOf()} selected={7} onSelect={() => {}} />)

    const marks = Array.from(container.querySelectorAll('.assento-marca'))
    for (const mark of marks) {
      expect(mark.closest('.assento-caixa')).toHaveAttribute('aria-hidden', 'true')
    }
    const markOf = (state: string) =>
      container.querySelector(`[data-estado="${state}"] .assento-marca`)?.textContent

    expect(markOf('livre')).toBe('')
    expect(markOf('selecionado')).not.toBe('')
    expect(markOf('reservado')).not.toBe('')
    expect(markOf('ocupado')).not.toBe('')
    expect(new Set([markOf('selecionado'), markOf('reservado'), markOf('ocupado')]).size).toBe(3)
  })

  it('a legenda explica as quatro situações em texto visível', () => {
    render(<SeatGrid seats={seatsOf()} selected={null} onSelect={() => {}} />)

    const legend = screen.getByRole('list', { name: 'Legenda dos assentos' })
    const items = within(legend)
      .getAllByRole('listitem')
      .map((item) => item.textContent)

    expect(items).toHaveLength(4)
    expect(items.join(' ')).toMatch(/livre/i)
    expect(items.join(' ')).toMatch(/selecionado/i)
    expect(items.join(' ')).toMatch(/reservado por outra pessoa/i)
    expect(items.join(' ')).toMatch(/ocupado/i)
  })

  it('duas grades na mesma tela não dividem a seleção (nome de radio único)', () => {
    render(
      <>
        <SeatGrid seats={seatsOf(4)} selected={1} onSelect={() => {}} />
        <SeatGrid seats={seatsOf(4)} selected={2} onSelect={() => {}} />
      </>,
    )

    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(2)
  })
})
