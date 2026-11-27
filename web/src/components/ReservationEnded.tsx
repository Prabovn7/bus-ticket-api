import { Link } from 'react-router'
import ErrorMessage from './ErrorMessage'

interface ReservationEndedProps {
  tripId: number
  message: string
}

/** A reserva acabou (prazo vencido ou assento perdido): a saída é escolher outro assento. */
function ReservationEnded({ tripId, message }: ReservationEndedProps) {
  return (
    <div className="quadro quadro-estado">
      <ErrorMessage>{message}</ErrorMessage>
      <Link className="botao botao-quadro" to={`/viagens/${tripId}`}>
        Escolher outro assento
      </Link>
    </div>
  )
}

export default ReservationEnded
