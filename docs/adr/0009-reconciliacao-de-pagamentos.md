# ADR 0009: Reconciliação de pagamentos no processo do worker

- Status: aceito
- Data: 2026-11-26 (Tasks 42 a 44 da Fase 3)

## Contexto

O pagamento (ADR 0007) chama o gateway fora de transação, em três passos. Se o processo
cair ou a rede falhar entre a cobrança e o passo B, o banco fica com um `payment`
`pending` enquanto o gateway pode já ter cobrado. O cancelamento (ADR 0008) pode deixar
um `payment` `approved` com a reserva `cancelled` quando o estorno falha. E uma aprovação
pode chegar depois de o hold vencer. Nenhum desses estados se resolve sozinho: é preciso
uma rotina que compare o banco com o gateway e feche as pontas.

## Decisão

- **A referência existe antes da cobrança.** `new_reference` cria a `gateway_ref`, a
  transação A a grava em `payments.gateway_ref`, e só depois vem `charge(ref, ...)`. Se o
  processo cair logo após o `charge`, a reconciliação ainda sabe qual cobrança consultar.
  A chave de idempotência decide **quem** cobra; a referência torna repetir uma cobrança
  segura. O `SimulatedGateway` é sem estado: a ref é `sim-<cenário>-<epoch>-<uuid>`.
- **Fase 1, pagamentos pendentes.** Seleciona `pending` com idade de pelo menos 45 s
  (`MIN_PAYMENT_AGE`), sem lock. Faz `session.rollback()` para encerrar a transação de
  leitura, consulta `gateway.get_status(ref)` sem nenhuma conexão com transação aberta e
  só então aplica o resultado sob `FOR UPDATE SKIP LOCKED`, conferindo de novo que o
  status ainda é `pending`. Dois reconciliadores não processam o mesmo pagamento (teste
  com `lock_timeout`, para a espera virar falha e não travamento).
- **Idade mínima de 45 s.** O `pay` estende o hold para pelo menos 60 s
  (`PAYMENT_WINDOW`). Com 45 s, o pedido original normalmente já terminou, e a
  reconciliação ainda chega dentro dessa janela. Um pedido pendente há menos que isso
  quase sempre está só em andamento.
- **Entrega do assento (`_deliver_seat`).** Aprovado: dentro de um SAVEPOINT, as pernas
  da reserva passam a `expires_at = NULL`. Se todas continuam dela, a reserva vira
  `paid`. Se alguma foi retomada por outro comprador, o SAVEPOINT é desfeito, as pernas
  que restam dela são apagadas e a reserva vira `expired`; o pagamento fica `approved`
  para a fase 2 estornar. Pernas vencidas mas ainda dela **confirmam a venda** (decisão
  do Pablo). Perna de outra pessoa nunca é tocada. Recusado: o pagamento vira `declined`
  e a reserva continua `held`.
- **Fase 2, estorno devido.** Pagamento `approved` cuja reserva está `cancelled` ou
  `expired`. Chama `gateway.refund(ref)` sem locks e depois
  `UPDATE ... WHERE status = 'approved'` para `refunded`. Uma só regra cobre a aprovação
  tardia e o estorno que falhou no cancelamento (ADR 0008).
- **Quem roda e quando.** No mesmo processo do expirador, na rodada de 30 s, depois da
  expiração dos holds. `app/worker.py` (`python -m app.worker`) monta as tarefas e as
  entrega ao laço de `app/booking/expirer.py` como `Task(name, run)`. O `booking` não
  importa `payments`: só o worker conhece os dois módulos.
- **O passo B do `pay` também se protege.** Entre a cobrança e o passo B passa tempo, e a
  reconciliação pode ter resolvido o mesmo pagamento. O passo B faz
  `UPDATE payments SET status = ... WHERE id = ... AND status = 'pending'`: se nenhuma
  linha muda, o pedido não escreve nada e responde `409 payment_already_resolved`. Se o
  pagamento foi aprovado, o assento é entregue pela mesma `deliver_seat` da reconciliação;
  se as pernas já são de outro comprador, o pagamento fica `approved`, a reserva vira
  `expired` e o pedido responde `409 seat_lost` (a segunda fase da reconciliação estorna). As duas respostas são
  guardadas na `Idempotency-Key`, então um replay devolve o mesmo 409.
- **Limpeza de chaves.** Uma segunda tarefa apaga `idempotency_keys` com mais de 24 h
  (`created_at` estritamente menor que agora menos 24 h), concluídas ou ainda "em
  andamento".
- **Erros.** Cada tarefa captura só `SQLAlchemyError`, registra com traceback e tenta de
  novo na rodada seguinte, sem impedir as demais. Qualquer outro erro é bug e derruba o
  processo.

## Alternativas descartadas

- **Reconciliação dentro de `app/booking/expirer.py`.** Inverteria a dependência:
  `booking` passaria a importar `payments`.
- **Um processo só para a reconciliação.** Mais um processo para um laço de poucas
  linhas. Fica como evolução (veja as consequências).
- **Esperar o webhook do gateway.** O simulador não envia, e um webhook também pode se
  perder: a reconciliação seria necessária de qualquer jeito.
- **Reconciliar dentro do `GET /api/reservations/{id}`.** Uma leitura que escreve e chama
  um serviço externo.
- **Consultar o gateway segurando o `FOR UPDATE`.** Prende conexão e lock durante a
  chamada externa (mesmo argumento dos ADRs 0007 e 0008).

## Consequências

- Com o worker parado nada se perde, só atrasa: os pagamentos ficam `pending` e os
  estornos devidos esperam. Quando ele volta, resolve tudo. Uma aprovação que chega depois
  de o assento ter sido retomado por outra pessoa vira estorno, nunca assento duplicado.
- **`gateway.refund(ref)` precisa ser idempotente por referência.** A reconciliação pode
  repetir a chamada (o estorno pode ter funcionado e o `UPDATE` ter falhado). É parte do
  contrato do `PaymentGateway`; o simulador cumpre e o teste confere.
- Um lote por rodada (`BATCH_SIZE` = 100): o que passar disso espera a rodada seguinte, e
  pagamentos ainda pendentes no gateway ocupam vaga no lote.
- As consultas ao gateway são sequenciais dentro da rodada. Com um gateway real e lento,
  a reconciliação atrasaria a expiração dos holds da rodada seguinte. Esse é o sinal para
  dividir em dois processos; `Task` e `build_tasks` já separam o que roda onde.
- **Limitação:** a reconciliação não toca em `idempotency_keys`. Uma chave "em andamento"
  de uma requisição que caiu continua respondendo 409 até a limpeza de 24 h; o cliente
  descobre o estado por `GET /api/reservations/{id}`.
- O pedido lento que chega ao passo B depois da reconciliação recebe 409 mesmo quando o
  resultado foi bom (a reconciliação confirmou a venda). O cliente descobre o estado real
  por `GET /api/reservations/{id}`. Foi a escolha mais simples e honesta: nenhum estado
  novo mapeado para status HTTP.
- Gateway simulado: nada é cobrado nem devolvido de verdade.
