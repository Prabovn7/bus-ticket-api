import { useEffect, useState } from 'react'
import { listCities } from '../api/catalog'
import { ApiRequestError } from '../api/client'
import type { City } from '../api/types'
import BoardState from '../components/BoardState'
import HoloCard from '../components/HoloCard'
import SearchForm, { type SearchValues } from '../components/SearchForm'
import TripBoard from '../components/TripBoard'
import { useSearchTrips } from '../hooks/useSearchTrips'
import { todayInSaoPaulo } from '../lib/formatting'
import HeroScene from '../components/HeroScene'

const SAME_CITY_MESSAGE = 'Escolha cidades diferentes para origem e destino.'

type CitiesState =
  | { status: 'loading' }
  | { status: 'ready'; cities: City[] }
  | { status: 'error'; error: ApiRequestError }

function SearchPage() {
  const [citiesState, setCitiesState] = useState<CitiesState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [values, setValues] = useState<SearchValues>({
    origin: 0,
    destination: 0,
    date: todayInSaoPaulo(),
  })
  const [searched, setSearched] = useState<SearchValues | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const { state, search } = useSearchTrips()

  useEffect(() => {
    const controller = new AbortController()
    listCities(controller.signal)
      .then((cities) => {
        if (controller.signal.aborted) return
        setCitiesState({ status: 'ready', cities })
        if (cities.length > 0) {
          setValues((current) => ({
            ...current,
            origin: cities[0].id,
            destination: cities[cities.length - 1].id,
          }))
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiRequestError) {
          setCitiesState({ status: 'error', error })
        } else {
          throw error
        }
      })
    return () => controller.abort()
  }, [attempt])

  function retryCities() {
    setCitiesState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }

  function runSearch(next: SearchValues) {
    if (next.origin === next.destination) {
      setFormError(SAME_CITY_MESSAGE)
      return
    }
    setFormError(null)
    setSearched(next)
    void search(next.origin, next.destination, next.date)
  }

  function handleChange(next: SearchValues) {
    setValues(next)
    setFormError(null)
  }

  function pickDate(date: string) {
    const next = { ...values, date }
    setValues(next)
    runSearch(next)
  }

  function renderBoard(cities: City[]) {
    if (formError) {
      return <BoardState kind="error" message={formError} />
    }
    if (state.status === 'loading') {
      return <BoardState kind="loading" />
    }
    if (state.status === 'error') {
      const retry =
        state.error.code === 'network_error' && searched ? () => runSearch(searched) : undefined
      return <BoardState kind="error" message={state.error.message} onRetry={retry} />
    }
    if (state.status === 'empty' && searched) {
      return <BoardState kind="empty" date={searched.date} onPickDate={pickDate} />
    }
    if (state.status === 'success' && searched) {
      const nameOf = (id: number) => cities.find((city) => city.id === id)?.name ?? ''
      return (
        <TripBoard
          trips={state.trips}
          origin={nameOf(searched.origin)}
          destination={nameOf(searched.destination)}
          date={searched.date}
        />
      )
    }
    return null
  }

  return (
    <section>
      <HeroScene title="Para onde você vai?" />

      <HoloCard>
        <p>
          <strong>Pagamentos simulados.</strong> Nada é cobrado nesta demonstração.
        </p>
      </HoloCard>

      {citiesState.status === 'loading' && <p role="status">Carregando cidades</p>}

      {citiesState.status === 'error' && (
        <BoardState kind="error" message={citiesState.error.message} onRetry={retryCities} />
      )}

      {citiesState.status === 'ready' && (
        <>
          <SearchForm
            cities={citiesState.cities}
            values={values}
            onChange={handleChange}
            onSubmit={() => runSearch(values)}
          />
          <div className="resultado">{renderBoard(citiesState.cities)}</div>
        </>
      )}
    </section>
  )
}

export default SearchPage
