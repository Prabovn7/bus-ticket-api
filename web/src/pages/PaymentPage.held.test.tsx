import { act, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderPayment, stubPaymentApi } from '../test/payment'

describe('PaymentPage: reserva em espera', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mostra quanto tempo falta para concluir', async () => {
    stubPaymentApi([])
    renderPayment()

    expect(await screen.findByRole('timer')).toHaveTextContent('09:00')
  })

  it('o tempo desce e, ao chegar a zero, a reserva expira e some o pagamento', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    stubPaymentApi([])
    renderPayment()
    await screen.findByRole('timer')

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByRole('timer')).toHaveTextContent('08:00')

    act(() => {
      vi.advanceTimersByTime(480_000)
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Sua reserva expirou.')
    expect(screen.getByRole('link', { name: 'Escolher outro assento' })).toHaveAttribute(
      'href',
      '/viagens/7',
    )
    expect(screen.queryByRole('button', { name: 'Pagar' })).toBeNull()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('o Pix é simulado: tem selo, avisa que o código não é real e que nada é cobrado', async () => {
    stubPaymentApi([])
    renderPayment()

    const pix = await screen.findByRole('region', { name: 'Pix simulado' })

    expect(within(pix).getByText('Simulação')).toBeInTheDocument()
    expect(
      within(pix).getByText(
        'Pagamento instantâneo simulado. Este código não é real: nenhum banco consegue ler nem pagar.',
      ),
    ).toBeInTheDocument()
    expect(within(pix).getByText('Nada é cobrado.')).toBeInTheDocument()
  })

  it('o código de exemplo é decorativo e não usa imagem nem a logo do Pix', async () => {
    stubPaymentApi([])
    renderPayment()

    const pix = await screen.findByRole('region', { name: 'Pix simulado' })

    expect(pix.querySelector('[data-pix-codigo]')).toHaveAttribute('aria-hidden', 'true')
    expect(within(pix).queryByRole('img')).toBeNull()
    expect(pix.querySelector('img')).toBeNull()
  })
})
