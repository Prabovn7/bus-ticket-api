interface PaymentPendingProps {
  onRefresh: () => void
}

/** O pagamento ficou em análise: não dá para pagar de novo, só conferir a situação. */
function PaymentPending({ onRefresh }: PaymentPendingProps) {
  return (
    <div className="quadro quadro-estado">
      <p role="status">Pagamento em análise.</p>
      <p>Quando a análise terminar, a situação muda aqui. Toque em atualizar para conferir.</p>
      <button type="button" className="botao" onClick={onRefresh}>
        Atualizar situação
      </button>
    </div>
  )
}

export default PaymentPending
