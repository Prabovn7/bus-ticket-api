/**
 * O aviso do Pix da demonstração. Não é um Pix de verdade: não há imagem de QR code nem a
 * marca do Pix, e o código de exemplo é só enfeite (aria-hidden), que o leitor de tela pula.
 * O texto diz com todas as letras que nada é cobrado.
 */
function PixSimulado() {
  return (
    <section className="pix" aria-label="Pix simulado">
      <span className="pix-selo">Simulação</span>
      <p>
        Pagamento instantâneo simulado. Este código não é real: nenhum banco consegue ler nem pagar.
      </p>
      <code className="pix-codigo" data-pix-codigo aria-hidden="true">
        SIMULADO 0000 NAO PAGAVEL 0000
      </code>
      <p>Nada é cobrado.</p>
    </section>
  )
}

export default PixSimulado
