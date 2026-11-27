import { Navigate, useLocation, useParams } from 'react-router'
import { useAuth } from '../auth/useAuth'
import BoardState from '../components/BoardState'
import HeroScene from '../components/HeroScene'
import { useReservation } from '../hooks/useReservation'
import { formatBRL } from '../lib/formatting'

const NOT_FOUND_MESSAGE = 'Reserva não encontrada.'

/** Só inteiros positivos escritos com dígitos: "1e3", "1.5" e "-3" não são ids de reserva. */
function parseReservationId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) {
    return null
  }
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function ReservationSummary({ reservationId }: { reservationId: number }) {
  const { state, reload } = useReservation(reservationId)

  if (state.status === 'loading') {
    return <p role="status">Carregando reserva</p>
  }
  if (state.status === 'error') {
    const retry = state.error.code === 'network_error' ? reload : undefined
    return <BoardState kind="error" message={state.error.message} onRetry={retry} />
  }

  const { reservation } = state
  if (reservation.status !== 'held') {
    return (
      <div className="quadro quadro-estado">
        <p>Esta reserva não está aguardando pagamento.</p>
      </div>
    )
  }
  return (
    <div className="quadro">
      <p>Assento: {reservation.seat_number}</p>
      <p>Valor: {formatBRL(reservation.price_cents)}</p>
    </div>
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
