import type { City } from '../api/types'

const SAO_PAULO = 'America/Sao_Paulo'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const clock = new Intl.DateTimeFormat('pt-BR', {
  timeZone: SAO_PAULO,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// O locale en-CA escreve a data como AAAA-MM-DD, o formato que a API e o input date usam.
const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: SAO_PAULO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dayLabel = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function formatBRL(cents: number): string {
  return brl.format(cents / 100)
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`
}

export function formatClock(iso: string): string {
  return clock.format(new Date(iso))
}

export function isNextDay(departureIso: string, arrivalIso: string): boolean {
  return localDate.format(new Date(arrivalIso)) > localDate.format(new Date(departureIso))
}

export function todayInSaoPaulo(now: Date = new Date()): string {
  return localDate.format(now)
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function formatDay(date: string): string {
  return dayLabel.format(new Date(`${date}T00:00:00Z`))
}

export function cityLabel(city: City): string {
  return `${city.name} (${city.uf})`
}
