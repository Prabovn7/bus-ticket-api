import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef, type PointerEvent, type ReactNode } from 'react'
import { useMediaQuery } from '../motion/useMediaQuery'
import { useReducedMotion } from '../motion/useReducedMotion'

gsap.registerPlugin(useGSAP)

const MAX_TILT_DEGREES = 8
const PERSPECTIVE = 700
const FOLLOW_SECONDS = 0.3
const WANDER_SECONDS = 5

interface Followers {
  glowX: (value: number) => void
  glowY: (value: number) => void
  tiltX: (value: number) => void
  tiltY: (value: number) => void
}

interface HoloCardProps {
  children: ReactNode
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

/**
 * Cartão de destaque com brilho iridescente que segue o ponteiro e inclinação leve (até 8 graus).
 * Nunca usar dentro de formulário, tabela, quadro de resultados ou mensagem de erro.
 */
function HoloCard({ children }: HoloCardProps) {
  const root = useRef<HTMLDivElement>(null)
  const followers = useRef<Followers | null>(null)
  const wander = useRef<gsap.core.Tween | null>(null)
  const reduced = useReducedMotion()
  const touchOnly = useMediaQuery('(hover: none)')

  const { contextSafe } = useGSAP(
    () => {
      const card = root.current
      if (!card || reduced) {
        return
      }

      gsap.set(card, { '--mx': 50, '--my': 50, transformPerspective: PERSPECTIVE })
      const options = { duration: FOLLOW_SECONDS, ease: 'power3.out' }
      followers.current = {
        glowX: gsap.quickTo(card, '--mx', options),
        glowY: gsap.quickTo(card, '--my', options),
        tiltX: gsap.quickTo(card, 'rotationX', options),
        tiltY: gsap.quickTo(card, 'rotationY', options),
      }
      if (touchOnly) {
        startWander(card)
      }

      return () => {
        followers.current = null
        wander.current = null
      }
    },
    { dependencies: [reduced, touchOnly], revertOnUpdate: true },
  )

  // Em tela sem hover o brilho passeia devagar sozinho, até alguém tocar.
  function startWander(card: HTMLElement) {
    wander.current = gsap.to(card, {
      '--mx': 80,
      '--my': 70,
      duration: WANDER_SECONDS,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    })
  }

  const follow = contextSafe((event: PointerEvent<HTMLDivElement>) => {
    const card = root.current
    const move = followers.current
    if (!card || !move) {
      return
    }

    wander.current?.kill()
    wander.current = null

    const rect = card.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width)
    const y = clamp((event.clientY - rect.top) / rect.height)
    move.glowX(x * 100)
    move.glowY(y * 100)
    // Toque não inclina: o dedo cobre o cartão e a inclinação só atrapalha a leitura.
    if (event.pointerType !== 'touch') {
      move.tiltY((x - 0.5) * 2 * MAX_TILT_DEGREES)
      move.tiltX((0.5 - y) * 2 * MAX_TILT_DEGREES)
    }
  })

  const rest = contextSafe(() => {
    const card = root.current
    const move = followers.current
    if (!card || !move) {
      return
    }

    move.glowX(50)
    move.glowY(50)
    move.tiltX(0)
    move.tiltY(0)
    if (touchOnly && !wander.current) {
      startWander(card)
    }
  })

  return (
    <div
      ref={root}
      className="holo"
      data-holo
      onPointerDown={follow}
      onPointerMove={follow}
      onPointerUp={rest}
      onPointerCancel={rest}
      onPointerLeave={rest}
    >
      <span className="holo-brilho" aria-hidden="true" />
      <div className="holo-conteudo">{children}</div>
    </div>
  )
}

export default HoloCard
