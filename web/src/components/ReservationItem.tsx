import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ApiRequestError } from '../api/client'
import { cancelReservation } from '../api/reservations'
import type { CancelResult, Reservation } from '../api/types'
import { formatBRL } from '../lib/formatting'
import ErrorMessage from './ErrorMessage'

const STATUS_LABELS: Record<string, string> = {
  held: 'Aguardando pagamento',
  paid: 'Paga',
  cancelled: 'Cancelada',
  expired: 'Expirada',
}

const GENERIC_MESSAGE = 'Algo deu errado. Tente de novo.'

/** Só as reservas em espera e as pagas podem ser canceladas. */
const CANCELLABLE = ['held', 'paid']

function cancelledMessage(refundStatus: string): string {
  if (refundStatus === 'refunded') return 'Reserva cancelada. Estorno concluído.'
  if (refundStatus === 'pending') return 'Reserva cancelada. O estorno está em andamento.'
  return 'Reserva cancelada.'
}

interface ReservationItemProps {
  reservation: Reservation
}

/** Uma reserva da lista, com Pagar (se estiver em espera) e Cancelar com confirmação na linha. */
function ReservationItem({ reservation }: ReservationItemProps) {
  const [asking, setAsking] = useState(false)
  // O botão Confirmar fica desabilitado enquanto o pedido está em andamento: não há segundo envio.
  const [cancelling, setCancelling] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // O resultado do cancelamento fica no item: a lista não recarrega nem pisca.
  const [result, setResult] = useState<CancelResult | null>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)

  // Ao fechar a confirmação sem cancelar, o foco volta ao botão que a abriu.
  useEffect(() => {
    if (!asking && returnFocus.current) {
      returnFocus.current = false
      cancelButton.current?.focus()
    }
  }, [asking])

  const status = result ? 'cancelled' : reservation.status
  const canCancel = CANCELLABLE.includes(status)

  function back() {
    returnFocus.current = true
    setAsking(false)
  }

  async function confirm() {
    setCancelling(true)
    setNotice(null)
    try {
      setResult(await cancelReservation(reservation.id))
      setAsking(false)
    } catch (error) {
      returnFocus.current = true
      setAsking(false)
      setNotice(error instanceof ApiRequestError ? error.message : GENERIC_MESSAGE)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <li>
      <p>Assento {reservation.seat_number}</p>
      <p>Viagem {reservation.trip_id}</p>
      <p>{formatBRL(reservation.price_cents)}</p>
      <p>{STATUS_LABELS[status] ?? status}</p>
      {status === 'held' ? <Link to={`/reservas/${reservation.id}/pagamento`}>Pagar</Link> : null}
      {canCancel && !asking ? (
        <button type="button" ref={cancelButton} onClick={() => setAsking(true)}>
          Cancelar reserva
        </button>
      ) : null}
      {asking ? (
        <div>
          <p>Cancelar a reserva do assento {reservation.seat_number}?</p>
          <button type="button" disabled={cancelling} onClick={() => void confirm()}>
            {cancelling ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
          <button type="button" autoFocus disabled={cancelling} onClick={back}>
            Voltar
          </button>
        </div>
      ) : null}
      {notice ? <ErrorMessage>{notice}</ErrorMessage> : null}
      <p role="status">{result ? cancelledMessage(result.refund_status) : ''}</p>
    </li>
  )
}

export default ReservationItem
