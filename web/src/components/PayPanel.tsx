import { useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '../api/client'
import { pay } from '../api/payments'
import type { PayScenario } from '../api/types'
import ErrorMessage from './ErrorMessage'

const SCENARIOS: { value: PayScenario; label: string }[] = [
  { value: 'approve', label: 'Aprovar o pagamento' },
  { value: 'decline', label: 'Recusar o pagamento' },
  { value: 'delay', label: 'Deixar em análise' },
]

const GENERIC_MESSAGE = 'Algo deu errado. Tente de novo.'

interface Attempt {
  key: string
  scenario: PayScenario
}

function PayPanel({ reservationId }: { reservationId: number }) {
  const [scenario, setScenario] = useState<PayScenario>('approve')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // A tentativa atual: a chave de idempotência e o cenário que ela vale. Repetir a tentativa
  // (depois de uma falha) reaproveita a chave; um pedido novo ou outro cenário gera outra.
  const attempt = useRef<Attempt | null>(null)
  // O estado só muda na próxima renderização; o ref bloqueia um segundo envio no mesmo instante.
  const sending = useRef(false)
  const request = useRef<AbortController | null>(null)

  // Sair da página no meio do pagamento cancela o pedido.
  useEffect(() => {
    return () => request.current?.abort()
  }, [])

  function keyFor(chosen: PayScenario): string {
    let current = attempt.current
    if (current === null || current.scenario !== chosen) {
      current = { key: crypto.randomUUID(), scenario: chosen }
      attempt.current = current
    }
    return current.key
  }

  async function submit() {
    if (sending.current) {
      return
    }
    sending.current = true
    setPending(true)
    setNotice(null)
    const controller = new AbortController()
    request.current = controller

    try {
      await pay(reservationId, scenario, keyFor(scenario), controller.signal)
      // Aprovado, recusado ou em análise: a tentativa terminou, a próxima será outra.
      attempt.current = null
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }
      setNotice(error instanceof ApiRequestError ? error.message : GENERIC_MESSAGE)
    } finally {
      sending.current = false
      setPending(false)
    }
  }

  return (
    <div>
      <fieldset disabled={pending}>
        <legend>Modo demonstração</legend>
        {SCENARIOS.map(({ value, label }) => (
          <label key={value}>
            <input
              type="radio"
              name="cenario"
              value={value}
              checked={scenario === value}
              onChange={() => setScenario(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {notice ? <ErrorMessage>{notice}</ErrorMessage> : null}
      <button type="button" className="botao" disabled={pending} onClick={() => void submit()}>
        {pending ? 'Pagando…' : 'Pagar'}
      </button>
    </div>
  )
}

export default PayPanel
