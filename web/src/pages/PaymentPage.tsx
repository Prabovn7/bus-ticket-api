import { useMemo, useState } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'
import type { Reservation } from '../api/types'
import { useAuth } from '../auth/useAuth'
import BoardState from '../components/BoardState'
import HeroScene from '../components/HeroScene'
import PaymentConfirmed from '../components/PaymentConfirmed'
import PaymentPending from '../components/PaymentPending'
import PayPanel from '../components/PayPanel'
import PixSimulado from '../components/PixSimulado'
import ReservationEnded from '../components/ReservationEnded'
import { toHold } from '../hooks/useActiveHold'
import { useCountdown } from '../hooks/useCountdown'
import { useReservation } from '../hooks/useReservation'
import { formatBRL, formatCountdown } from '../lib/formatting'

const NOT_FOUND_MESSAGE = 'Reserva não encontrada.'

/** Só inteiros positivos escritos com dígitos: "1e3", "1.5" e "-3" não são ids de reserva. */
function parseReservationId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) {
    return null
  }
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

type Outcome =
  { kind: 'none' } | { kind: 'approved' } | { kind: 'pending' } | { kind: 'ended'; message: string }

interface HeldReservationProps {
  reservation: Reservation
  onApproved: () => void
  onPending: () => void
  onEnded: (message: string) => void
}

/** A reserva à espera do pagamento: o tempo que falta, o Pix simulado e o botão de pagar. */
function HeldReservation({ reservation, onApproved, onPending, onEnded }: HeldReservationProps) {
  const hold = useMemo(() => toHold(reservation), [reservation])
  const seconds = useCountdown(hold)
  if (hold === null || seconds === null || seconds === 0) {
    return <ReservationEnded tripId={reservation.trip_id} message="Sua reserva expirou." />
  }
  return (
    <div className="quadro">
      <p>Assento: {reservation.seat_number}</p>
      <p>Valor: {formatBRL(reservation.price_cents)}</p>
      <p>
        Tempo para concluir:{' '}
        <time role="timer" dateTime={`PT${seconds}S`}>
          {formatCountdown(seconds)}
        </time>
      </p>
      <PixSimulado />
      <PayPanel
        reservationId={reservation.id}
        onApproved={onApproved}
        onPending={onPending}
        onEnded={onEnded}
      />
    </div>
  )
}

function ReservationSummary({ reservationId }: { reservationId: number }) {
  const { state, reload } = useReservation(reservationId)
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' })
  if (state.status === 'loading') return <p role="status">Carregando reserva</p>
  if (state.status === 'error') {
    const retry = state.error.code === 'network_error' ? reload : undefined
    return <BoardState kind="error" message={state.error.message} onRetry={retry} />
  }
  const { reservation } = state
  if (outcome.kind === 'ended') {
    return <ReservationEnded tripId={reservation.trip_id} message={outcome.message} />
  }
  // Em análise, quem confirma é o servidor: ao atualizar, a reserva paga vira a viagem confirmada.
  if (
    outcome.kind === 'approved' ||
    (outcome.kind === 'pending' && reservation.status === 'paid')
  ) {
    return (
      <PaymentConfirmed seatNumber={reservation.seat_number} priceCents={reservation.price_cents} />
    )
  }
  if (reservation.status !== 'held') {
    return (
      <div className="quadro quadro-estado">
        <p>Esta reserva não está aguardando pagamento.</p>
      </div>
    )
  }
  if (outcome.kind === 'pending') {
    return <PaymentPending onRefresh={reload} />
  }
  return (
    <HeldReservation
      reservation={reservation}
      onApproved={() => setOutcome({ kind: 'approved' })}
      onPending={() => setOutcome({ kind: 'pending' })}
      onEnded={(message) => setOutcome({ kind: 'ended', message })}
    />
  )
}

function PaymentPage() {
  const { reservationId } = useParams()
  const { status } = useAuth()
  const location = useLocation()
  const id = parseReservationId(reservationId)

  // Guarda só o caminho (texto), para o Entrar saber para onde voltar.
  if (status === 'anonymous') {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  }

  return (
    <section>
      <HeroScene title="Pagamento" />
      {id === null ? (
        <BoardState kind="error" message={NOT_FOUND_MESSAGE} />
      ) : status === 'loading' ? (
        // Ainda não se sabe se a pessoa está logada: espera, sem chamar a API.
        <p role="status">Carregando reserva</p>
      ) : (
        <ReservationSummary reservationId={id} />
      )}
    </section>
  )
}

export default PaymentPage
