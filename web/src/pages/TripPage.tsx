import { useState } from 'react'
import { Link, useParams } from 'react-router'
import BoardState from '../components/BoardState'
import HeroScene from '../components/HeroScene'
import SeatGrid from '../components/SeatGrid'
import { useSeatMap } from '../hooks/useSeatMap'

const NOT_FOUND_MESSAGE = 'Viagem não encontrada.'

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
  const [selected, setSelected] = useState<number | null>(null)

  if (state.status === 'loading') {
    return <p role="status">Carregando assentos</p>
  }
  if (state.status === 'error') {
    const retry = state.error.code === 'network_error' ? reload : undefined
    return <BoardState kind="error" message={state.error.message} onRetry={retry} />
  }
  return (
    <>
      <SeatGrid seats={state.seatMap.seats} selected={selected} onSelect={setSelected} />
      <p>
        {selected === null ? 'Nenhum assento selecionado.' : `Assento ${selected} selecionado.`}
      </p>
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
