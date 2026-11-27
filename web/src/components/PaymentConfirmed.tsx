import { formatBRL } from '../lib/formatting'
import HoloCard from './HoloCard'

interface PaymentConfirmedProps {
  seatNumber: number
  priceCents: number
}

/** O pagamento foi aprovado: o cartão de destaque da viagem confirmada. */
function PaymentConfirmed({ seatNumber, priceCents }: PaymentConfirmedProps) {
  return (
    <HoloCard>
      <h2>Viagem confirmada</h2>
      <p role="status">Pagamento aprovado.</p>
      <p>Assento: {seatNumber}</p>
      <p>Valor: {formatBRL(priceCents)}</p>
    </HoloCard>
  )
}

export default PaymentConfirmed
