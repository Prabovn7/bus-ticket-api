import { addDays, formatDay } from '../lib/formatting'

type BoardStateProps =
  | { kind: 'loading' }
  | { kind: 'empty'; date: string; onPickDate: (date: string) => void }
  | { kind: 'error'; message: string; onRetry?: () => void }

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icone-erro">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </svg>
  )
}

function BoardState(props: BoardStateProps) {
  if (props.kind === 'loading') {
    return (
      <div className="quadro quadro-estado" role="status">
        <p>Buscando viagens</p>
        <div className="esqueleto" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    )
  }

  if (props.kind === 'empty') {
    const { date, onPickDate } = props
    const nextDays = [addDays(date, 1), addDays(date, 2)]
    return (
      <div className="quadro quadro-estado" role="status">
        <p>Nenhuma viagem em {formatDay(date)}.</p>
        <p>Tente em outro dia:</p>
        <div className="atalhos">
          {nextDays.map((day) => (
            <button
              key={day}
              type="button"
              className="botao botao-quadro"
              onClick={() => onPickDate(day)}
            >
              {formatDay(day)}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const { message, onRetry } = props
  return (
    <div className="quadro quadro-estado quadro-erro" role="alert">
      <p className="erro-texto">
        <AlertIcon />
        <span>{message}</span>
      </p>
      {onRetry && (
        <button type="button" className="botao botao-quadro" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  )
}

export default BoardState
