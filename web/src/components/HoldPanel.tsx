import { Link } from 'react-router'
import type { Hold } from '../api/types'
import { formatBRL, formatCountdown } from '../lib/formatting'

interface HoldPanelProps {
  hold: Hold
  seconds: number
}

/**
 * A reserva feita: qual assento, quanto custa e quanto tempo falta.
 * O aviso do assento é um status (anunciado uma vez); o timer muda a cada segundo e
 * por isso não é uma região viva: um leitor de tela o leria sem parar.
 * O link leva ao pagamento: é um link (e não um botão) porque navega para outro endereço.
 */
function HoldPanel({ hold, seconds }: HoldPanelProps) {
  return (
    <div className="quadro quadro-estado">
      <p role="status">Assento {hold.seat_number} reservado para você.</p>
      <p>Valor: {formatBRL(hold.price_cents)}</p>
      <p>
        Tempo para concluir:{' '}
        <time role="timer" dateTime={`PT${seconds}S`}>
          {formatCountdown(seconds)}
        </time>
      </p>
      <p>Se o tempo acabar, o assento volta a ficar livre para outras pessoas.</p>
      <Link className="botao botao-quadro" to={`/reservas/${hold.id}/pagamento`}>
        Ir para o pagamento
      </Link>
    </div>
  )
}

export default HoldPanel
