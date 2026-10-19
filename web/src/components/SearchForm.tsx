import type { City } from '../api/types'
import { cityLabel } from '../lib/formatting'

export interface SearchValues {
  origin: number
  destination: number
  date: string
}

interface SearchFormProps {
  cities: City[]
  values: SearchValues
  onChange: (values: SearchValues) => void
  onSubmit: () => void
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4" />
    </svg>
  )
}

function SearchForm({ cities, values, onChange, onSubmit }: SearchFormProps) {
  return (
    <form
      className="busca"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="campo">
        <label htmlFor="origem">Origem</label>
        <select
          id="origem"
          value={values.origin}
          onChange={(event) => onChange({ ...values, origin: Number(event.target.value) })}
        >
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {cityLabel(city)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="botao-inverter"
        aria-label="Inverter origem e destino"
        onClick={() =>
          onChange({ ...values, origin: values.destination, destination: values.origin })
        }
      >
        <SwapIcon />
      </button>

      <div className="campo">
        <label htmlFor="destino">Destino</label>
        <select
          id="destino"
          value={values.destination}
          onChange={(event) => onChange({ ...values, destination: Number(event.target.value) })}
        >
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {cityLabel(city)}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="data">Data</label>
        <input
          id="data"
          type="date"
          value={values.date}
          onChange={(event) => onChange({ ...values, date: event.target.value })}
        />
      </div>

      <button type="submit" className="botao">
        Buscar viagens
      </button>
    </form>
  )
}

export default SearchForm
