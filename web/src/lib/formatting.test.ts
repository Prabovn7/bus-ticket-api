import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatBRL,
  formatClock,
  formatDay,
  formatDuration,
  isNextDay,
  todayInSaoPaulo,
} from './formatting'

describe('formatBRL', () => {
  it('formata centavos em reais, com espaço não separável depois do R$', () => {
    expect(formatBRL(7990)).toBe('R$\u00a079,90')
    expect(formatBRL(100000)).toBe('R$\u00a01.000,00')
  })
})

describe('formatDuration', () => {
  it('mostra horas e minutos, ou só minutos quando passa de uma hora', () => {
    expect(formatDuration(270)).toBe('4h30')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(120)).toBe('2h')
    expect(formatDuration(65)).toBe('1h05')
  })
})

describe('formatClock', () => {
  it('usa o horário de São Paulo', () => {
    expect(formatClock('2026-10-19T11:00:00Z')).toBe('08:00')
    expect(formatClock('2026-10-20T02:00:00Z')).toBe('23:00')
  })

  it('mostra meia-noite como 00:00, e não 24:00', () => {
    expect(formatClock('2026-10-19T03:00:00Z')).toBe('00:00')
  })
})

describe('isNextDay', () => {
  it('é verdadeiro quando a data local de São Paulo muda', () => {
    expect(isNextDay('2026-10-21T02:00:00Z', '2026-10-21T08:30:00Z')).toBe(true)
  })

  it('é falso quando saída e chegada caem no mesmo dia', () => {
    expect(isNextDay('2026-10-20T11:00:00Z', '2026-10-20T17:30:00Z')).toBe(false)
  })

  it('não confunde o dia de UTC com o dia de São Paulo', () => {
    // 17:00 e 22:00 de São Paulo, no mesmo dia, mas em UTC a data muda.
    expect(isNextDay('2026-10-20T20:00:00Z', '2026-10-21T01:00:00Z')).toBe(false)
  })
})

describe('todayInSaoPaulo', () => {
  it('devolve a data de São Paulo, mesmo quando em UTC já é o dia seguinte', () => {
    expect(todayInSaoPaulo(new Date('2026-10-20T02:00:00Z'))).toBe('2026-10-19')
    expect(todayInSaoPaulo(new Date('2026-10-20T03:00:00Z'))).toBe('2026-10-20')
  })
})

describe('addDays', () => {
  it('soma dias virando mês e ano', () => {
    expect(addDays('2026-10-20', 1)).toBe('2026-10-21')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('formatDay', () => {
  it('escreve o dia por extenso, em português', () => {
    expect(formatDay('2026-10-20')).toContain('20 de outubro')
    expect(formatDay('2026-10-20')).toContain('terça')
  })
})
