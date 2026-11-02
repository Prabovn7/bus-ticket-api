import { useEffect, useState } from 'react'
import type { Hold } from '../api/types'

const TICK_MS = 250

interface Reading {
  hold: Hold
  seconds: number
}

/**
 * Segundos que faltam para a reserva expirar, ou null sem reserva.
 *
 * Conta a partir dos segundos que o SERVIDOR mandou, usando o relógio monotônico do
 * navegador (performance.now): se o usuário mudar a hora do computador, a contagem não
 * muda. O prazo é fixo; o intervalo só lê quanto falta, então uma aba em segundo plano,
 * que atrasa os tiques, mostra o valor certo ao voltar. Arredonda para cima: 0 só quando
 * o tempo acabou. A identidade da reserva decide quando recomeçar, como em useFreeSeats.
 */
export function useCountdown(hold: Hold | null): number | null {
  const [reading, setReading] = useState<Reading | null>(null)

  useEffect(() => {
    if (!hold) {
      return
    }
    const deadline = performance.now() + hold.expires_in_seconds * 1000
    const id = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000))
      setReading((previous) =>
        previous?.hold === hold && previous.seconds === seconds ? previous : { hold, seconds },
      )
      if (seconds === 0) {
        clearInterval(id)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [hold])

  if (!hold) {
    return null
  }
  return reading?.hold === hold ? reading.seconds : hold.expires_in_seconds
}
