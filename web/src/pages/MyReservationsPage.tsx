import { Link, Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import BoardState from '../components/BoardState'
import HeroScene from '../components/HeroScene'
import ReservationItem from '../components/ReservationItem'
import { useReservations } from '../hooks/useReservations'

/** A lista de reservas da pessoa logada: carregando, erro, vazia ou com as reservas. */
function ReservationList() {
  const { state, reload } = useReservations()
  if (state.status === 'loading') {
    return <p role="status">Carregando reservas</p>
  }
  if (state.status === 'error') {
    const retry = state.error.code === 'network_error' ? reload : undefined
    return <BoardState kind="error" message={state.error.message} onRetry={retry} />
  }
  if (state.reservations.length === 0) {
    return (
      <div className="quadro quadro-estado">
        <p>Você ainda não tem reservas.</p>
        <Link className="botao botao-quadro" to="/">
          Buscar viagens
        </Link>
      </div>
    )
  }
  return (
    <ul className="reservas" aria-label="Suas reservas">
      {state.reservations.map((reservation) => (
        <ReservationItem key={reservation.id} reservation={reservation} />
      ))}
    </ul>
  )
}

function MyReservationsPage() {
  const { status } = useAuth()
  const location = useLocation()

  // Guarda só o caminho (texto), para o Entrar saber para onde voltar.
  if (status === 'anonymous') {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  }

  return (
    <section>
      <HeroScene title="Minhas reservas" />
      {status === 'loading' ? (
        // Ainda não se sabe se a pessoa está logada: espera, sem chamar a API.
        <p role="status">Carregando reservas</p>
      ) : (
        <ReservationList />
      )}
    </section>
  )
}

export default MyReservationsPage
