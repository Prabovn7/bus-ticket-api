import { authedFetch } from '../auth/authedFetch'
import { ApiRequestError } from './client'
import type { Payment, PayScenario } from './types'

function isPayment(body: unknown): body is Payment {
  return (
    typeof body === 'object' &&
    body !== null &&
    'payment_id' in body &&
    'status' in body &&
    'reservation_status' in body &&
    typeof body.payment_id === 'number' &&
    typeof body.status === 'string' &&
    typeof body.reservation_status === 'string'
  )
}

/**
 * Paga uma reserva no gateway simulado. Exige login.
 *
 * Aprovado (200), em análise (202) e recusado (402) são resultados do pagamento e voltam
 * como Payment: a tela decide pelo status. Erros de regra (409, 410, 422...) lançam
 * ApiRequestError. A mesma idempotencyKey repete o mesmo resultado, sem cobrar duas vezes.
 */
export async function pay(
  reservationId: number,
  scenario: PayScenario,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Payment> {
  try {
    return await authedFetch<Payment>(`/api/reservations/${reservationId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ scenario }),
      ...(signal ? { signal } : {}),
    })
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 402 && isPayment(error.body)) {
      return error.body
    }
    throw error
  }
}
