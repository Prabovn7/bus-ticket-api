import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { createHold } from '../api/booking'
import { ApiRequestError } from '../api/client'
import type { Hold } from '../api/types'
import { useAuth } from '../auth/useAuth'
import BoardState from '../components/BoardState'
import ErrorMessage from '../components/ErrorMessage'
import HeroScene from '../components/HeroScene'
import HoldPanel from '../components/HoldPanel'
import SeatGrid from '../components/SeatGrid'
import { useCountdown } from '../hooks/useCountdown'
import { useSeatMap } from '../hooks/useSeatMap'

const NOT_FOUND_MESSAGE = 'Viagem não encontrada.'
const SEAT_TAKEN_MESSAGE = 'Esse assento acabou de ser reservado por outra pessoa. Escolha outro.'
const GENERIC_MESSAGE = 'Algo deu errado. Tente de novo.'

/** Só inteiros positivos escritos com dígitos: "1e3", "1.5" e "-3" não são ids de viagem. */
function parseTripId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) {
    return null
  }
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function SeatPicker({ tripId }: { tripId: number }) {
  const { state, reload } = useSeatMap(tripId)
  const { status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [selected, setSelected] = useState<number | null>(null)
  const [hold, setHold] = useState<Hold | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // O estado só muda na próxima renderização; o ref bloqueia um segundo envio no mesmo instante.
  const sending = useRef(false)
  const request = useRef<AbortController | null>(null)
  const seconds = useCountdown(hold)

  // Sair da página no meio da reserva cancela o pedido.
  useEffect(() => {
    return () => request.current?.abort()
  }, [])

  function goToLogin() {
    // Guarda só o caminho (texto), para o Entrar saber para onde voltar.
    void navigate('/entrar', { state: { from: location.pathname } })
  }

  async function reserve() {
    if (selected === null || sending.current) {
      return
    }
    if (status !== 'authenticated') {
      goToLogin()
      return
    }
    sending.current = true
    setPending(true)
    setNotice(null)
    const controller = new AbortController()
    request.current = controller

    try {
      setHold(await createHold(tripId, selected, controller.signal))
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }
      if (error instanceof ApiRequestError && error.status === 401) {
        goToLogin()
        return
      }
      if (error instanceof ApiRequestError && error.code === 'seat_unavailable') {
        setNotice(SEAT_TAKEN_MESSAGE)
        setSelected(null)
        reload()
        return
      }
      setNotice(error instanceof ApiRequestError ? error.message : GENERIC_MESSAGE)
    } finally {
      sending.current = false
      setPending(false)
    }
  }

  function chooseAnother() {
    setHold(null)
    setSelected(null)
    setNotice(null)
    reload()
  }

  function select(seatNumber: number) {
    setSelected(seatNumber)
    setNotice(null)
  }

  if (hold && seconds !== null) {
    return seconds > 0 ? (
      <HoldPanel hold={hold} seconds={seconds} />
    ) : (
      <div className="quadro quadro-estado">
        <ErrorMessage>Sua reserva expirou.</ErrorMessage>
        <button type="button" className="botao botao-quadro" onClick={chooseAnother}>
          Escolher outro assento
        </button>
      </div>
    )
  }
  if (state.status === 'loading') {
    return <p role="status">Carregando assentos</p>
  }
  if (state.status === 'error') {
    const retry = state.error.code === 'network_error' ? reload : undefined
    return <BoardState kind="error" message={state.error.message} onRetry={retry} />
  }
  return (
    <>
      <SeatGrid seats={state.seatMap.seats} selected={selected} onSelect={select} />
      <p>
        {selected === null ? 'Nenhum assento selecionado.' : `Assento ${selected} selecionado.`}
      </p>
      {notice ? <ErrorMessage>{notice}</ErrorMessage> : null}
      {selected !== null ? (
        <button
          type="button"
          className="botao"
          disabled={pending || status === 'loading'}
          onClick={() => void reserve()}
        >
          {status === 'anonymous'
            ? `Entrar para reservar o assento ${selected}`
            : `Reservar assento ${selected}`}
        </button>
      ) : null}
    </>
  )
}

function TripPage() {
  const { tripId } = useParams()
  const id = parseTripId(tripId)

  return (
    <section>
      <HeroScene title="Escolher assento" />
      <p>
        <Link to="/">Voltar à busca</Link>
      </p>
      {id === null ? (
        <BoardState kind="error" message={NOT_FOUND_MESSAGE} />
      ) : (
        // A chave zera o assento escolhido quando a URL passa para outra viagem.
        <SeatPicker key={id} tripId={id} />
      )}
    </section>
  )
}

export default TripPage
