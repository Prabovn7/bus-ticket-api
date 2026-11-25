# ADR 0008: Cancelamento idempotente pelo estado da reserva, com estorno fora da transação

- Status: aceito
- Data: 2026-11-24 (Tasks 39 e 40 da Fase 3)

## Contexto

Cancelar uma reserva paga tem dois efeitos que não cabem numa transação só: liberar o
assento no banco e devolver o dinheiro num serviço externo (o gateway). O pedido pode
chegar repetido ou ao mesmo tempo (duplo clique, retry de rede). O requisito é: o
assento é liberado uma vez e o dinheiro é estornado **uma** vez, nunca duas.

Diferente do pagamento (ADR 0007), o cancelamento já tem uma identidade natural: a
própria reserva. Não faz sentido o cliente inventar uma chave.

## Decisão

- **Idempotência pelo estado, sem chave.** `POST /api/reservations/{id}/cancel` não
  recebe `Idempotency-Key`. A reserva é lida com `SELECT ... FOR UPDATE`: dois pedidos
  simultâneos entram em fila nessa linha. Quem encontra `paid` ou `held` cancela; quem
  encontra `cancelled` recebe o mesmo resultado, sem estorno.
- **Só a transição estorna.** O pedido que muda a reserva para `cancelled` é o único que
  recebe o direito ao estorno (`to_refund`). Os demais nem chamam o gateway.
- **Três passos, como no pagamento.** A (curta): trava a reserva, confere as regras,
  marca `cancelled`, apaga as `seat_legs`, commit. Gateway: `refund` **sem transação
  aberta e sem lock**. B (curta): `UPDATE payments SET status = 'refunded' WHERE id = ...
  AND status = 'approved'`, commit. O filtro de status impede sobrescrever um pagamento
  que outra rotina já resolveu entre A e B.
- **Reserva `held` sem pagamento aprovado:** cancela e libera o assento, sem estorno
  (`refund_status = "none"`). Pagamento recusado também não gera estorno.
- **Regras de recusa (409):** `trip_already_departed` quando agora é maior ou igual à
  partida da reserva (saída da viagem mais o `offset_minutes` da parada de origem);
  `payment_in_progress` quando há um pagamento `pending`; `reservation_not_cancellable`
  quando o hold já venceu (pelo relógio ou por já estar `expired`).
- **Estorno integral.** O valor devolvido é o do pagamento aprovado, sem taxa e sem regra
  por prazo (política fictícia do projeto).
- **Resposta:** `{reservation_id, status, refund_status}` com `refund_status` em `none`,
  `pending` (estorno devido) ou `refunded`. O estado de um replay é derivado do
  pagamento mais recente, então pode diferir da primeira resposta enquanto o estorno
  está em andamento.
- **Leituras (Task 39).** `GET /api/reservations/{id}` e `GET /api/reservations` moram em
  `app/payments/` porque leem `payments`, e `payments` pode depender de `booking`, nunca
  o contrário. Reserva alheia ou inexistente dá 404. O hold vencido aparece como
  `expired` derivado pelo `Clock`, sem escrever no banco: o `GET` só lê e a faxina
  continua sendo do expirador. A lista traz até 50 reservas, mais recentes primeiro, com
  o status do pagamento mais recente numa subconsulta (uma ida ao banco, sem N+1).

## Se o estorno falhar

Se o gateway falhar depois do commit de A, a reserva continua cancelada, o assento fica
livre e o `payment` fica `approved`. O passo B não roda, então o banco nunca afirma um
estorno que o gateway não confirmou. Um novo pedido de cancelamento encontra `cancelled`
e responde `refund_status = "pending"` **sem tentar de novo**: quem retoma esses
estornos é a reconciliação (Task 42), que procura reservas canceladas com pagamento
`approved`. O pior caso aceito é "assento livre e estorno atrasado", nunca "dinheiro
devolvido com o assento ocupado".

## Alternativas descartadas

- **Estornar antes de cancelar no banco.** Se o banco falhar depois do estorno, o dinheiro
  volta mas o assento continua ocupado.
- **Tudo numa transação, com o gateway dentro.** Mantém o lock da reserva e uma conexão
  durante a chamada externa (mesmo argumento do ADR 0007).
- **`Idempotency-Key` também no cancelamento.** Dois pedidos com chaves diferentes ainda
  precisariam do estado para não estornar duas vezes; a chave seria um segundo mecanismo
  sem ganho.
- **Estado intermediário `refunding` no pagamento.** Permitiria retomar o estorno sem
  heurística, mas exigiria uma migration e mais estados para o mesmo efeito; fica como
  evolução se a reconciliação ficar complexa.
- **Cancelar com pagamento em análise e estornar depois, se o gateway aprovar.** Deixaria
  uma cobrança possível sem assento por algum tempo; a recusa com 409 é mais simples e
  segura.

## Consequências

- Dois cancelamentos simultâneos geram um estorno (teste com 20 threads e gateway lento).
- A Task 42 precisa tratar reservas `cancelled` com `payment` `approved`, além dos
  pagamentos `pending` antigos.
- Um cancelamento com pagamento em análise exige esperar a reconciliação resolver o
  pagamento.
- A lista não tem paginação (teto de 50), e o teto não tem teste porque a capacidade de
  40 assentos por viagem exigiria várias viagens para ultrapassá-lo.
- `_departure` assume que a parada de origem existe em `route_stops`; o banco não
  garante isso (limitação já registrada), e uma reserva inconsistente daria erro 500.
- Limitações: gateway simulado (nada é devolvido); sem rate limit em `/cancel` até a
  Fase 6.
