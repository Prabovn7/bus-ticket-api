import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef } from 'react'
import { useReducedMotion } from '../motion/useReducedMotion'

gsap.registerPlugin(useGSAP)

// Cada folha dura 80 ms (ritmo de placa de rodoviária). O teto de 4 folhas por dígito e o
// atraso de 60 ms entre dígitos mantêm a placa inteira abaixo de 0,6 s.
const FLIP_SECONDS = 0.08
const MAX_FLIPS = 4
const STAGGER_SECONDS = 0.06
const PERSPECTIVE = 240

interface FlapTimeProps {
  /** Horário no formato HH:MM, como vem de formatClock. */
  value: string
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && /^\d$/.test(char)
}

/** Posições, dentro de `value`, dos dígitos (os separadores, como os dois-pontos, ficam de fora). */
function digitPositions(value: string): number[] {
  return Array.from(value).flatMap((char, position) => (isDigit(char) ? [position] : []))
}

function FlapTime({ value }: FlapTimeProps) {
  const root = useRef<HTMLSpanElement>(null)
  // O último horário que as folhas terminaram de mostrar; é de onde a próxima mudança parte.
  const shown = useRef<string | null>(null)
  const reduced = useReducedMotion()

  useGSAP(
    () => {
      const elements = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-folha]') ?? [])
      const positions = digitPositions(value)

      if (reduced) {
        elements.forEach((element, order) => {
          element.textContent = value[positions[order]]
        })
        shown.current = value
        return
      }

      const from = shown.current
      const master = gsap.timeline({
        onComplete: () => {
          shown.current = value
        },
      })

      elements.forEach((element, order) => {
        const position = positions[order]
        const target = Number(value[position])
        const before = from?.[position]
        const flips = isDigit(before)
          ? Math.min((target - Number(before) + 10) % 10, MAX_FLIPS)
          : MAX_FLIPS
        if (flips === 0) {
          return
        }

        const start = (target - flips + 10) % 10
        element.textContent = String(start)
        gsap.set(element, { transformPerspective: PERSPECTIVE })

        const flaps = gsap.timeline()
        for (let step = 1; step <= flips; step++) {
          flaps.call(() => {
            element.textContent = String((start + step) % 10)
          })
          flaps.fromTo(
            element,
            { rotationX: -90 },
            { rotationX: 0, duration: FLIP_SECONDS, ease: 'power2.out', immediateRender: false },
          )
        }
        master.add(flaps, order * STAGGER_SECONDS)
      })

      if (master.duration() === 0) {
        shown.current = value
      }
    },
    { scope: root, dependencies: [value, reduced], revertOnUpdate: true },
  )

  return (
    <span ref={root} className="placa-hora">
      <span className="so-leitor">{value}</span>
      <span className="placa-folhas" aria-hidden="true">
        {Array.from(value).map((char, index) =>
          isDigit(char) ? (
            <span key={index} className="folha" data-folha>
              {char}
            </span>
          ) : (
            <span key={index} className="folha-separador">
              {char}
            </span>
          ),
        )}
      </span>
    </span>
  )
}

export default FlapTime
