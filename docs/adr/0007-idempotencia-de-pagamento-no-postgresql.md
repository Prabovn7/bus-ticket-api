# ADR 0007: Idempotência do pagamento no PostgreSQL, com o gateway fora da transação

- Status: aceito
- Data: 2026-11-24 (Tasks 35 a 38 da Fase 3)

## Contexto

Pagar uma reserva chama um serviço externo (o gateway). Redes falham, o cliente repete
a requisição, o usuário clica duas vezes. O requisito é: a mesma intenção de pagamento
gera **uma** cobrança, por mais vezes que a requisição chegue, inclusive ao mesmo tempo.

## Decisão

- **Chave de idempotência no PostgreSQL.** O cabeçalho `Idempotency-Key` é obrigatório
  (422 sem ele). A tabela `idempotency_keys` tem `PRIMARY KEY (user_id, key)`: a chave é
  por usuário, senão um usuário receberia a resposta salva de outro. Guarda o hash do
  pedido (`reservation_id` e `scenario`), o status HTTP e o corpo da resposta.
  `response_status NULL` significa "em andamento".
- **Quem decide a corrida é o banco.** `INSERT ... ON CONFLICT DO NOTHING` na chave:
  quem insere ganha; os outros esperam o commit da transação A (curta) e leem a linha.
- **Três passos.** A (curta): registra a chave, trava a reserva com `FOR UPDATE`,
  estende o hold por 60 s e grava o `payment` como `pending`, commit. Gateway: chamado
  **sem transação aberta e sem lock**. B (curta): grava o resultado, marca a reserva
  como `paid` se aprovado, salva a resposta na chave, commit.
- **Respostas.** Aprovado 200, recusado 402 (a reserva segue `held`), em análise 202.
  O router devolve o status salvo, então o replay repete exatamente a primeira resposta.
- **Erros antes da cobrança desfazem tudo, chave inclusive** (404, 409 não pagável,
  410 hold vencido): o cliente pode tentar de novo com a mesma chave.
- **Mesma chave, pedido diferente:** 422 `idempotency_key_reused` (o hash inclui o id
  da reserva). Mesma chave ainda em andamento: 409 `request_in_progress`.
- **A transação A estende a reserva e as pernas** com `GREATEST(expires_at, agora + 60 s)`,
  nunca encurtando. O expirador decide por `reservations.expires_at`; sem estender a
  reserva, um pagamento em andamento seria expirado no meio.

## Por que o gateway fica fora da transação

Segurar o lock da reserva enquanto um serviço externo responde bloquearia qualquer
outra requisição ou o expirador sobre a mesma linha, pelo tempo que o gateway demorar,
e prenderia uma conexão do pool. Duas transações curtas evitam isso. O custo é a
janela entre A e B: se o processo cair ali, o `payment` fica `pending` e a chave fica
em andamento. Um retry recebe 409 e **nunca cobra duas vezes**; a reconciliação
(Task 42) consulta o gateway e resolve.

## Alternativas descartadas

- **Chave no Redis.** Rápida, mas a garantia viraria "melhor esforço": uma perda do
  Redis ou uma expiração antes da hora permite duas cobranças, e a chave ficaria fora
  da transação do banco. No projeto o Redis é só canal de avisos (ADR 0001).
- **`UNIQUE` só em `payments` (uma cobrança por reserva).** Impede duas linhas, mas não
  devolve a resposta salva nem distingue um retry de um pedido diferente, e uma
  recusa seguida de nova tentativa legítima ficaria bloqueada.
- **Sem chave.** Cada retry seria uma nova cobrança.
- **Uma transação só, com o gateway dentro.** Mais simples, mas mantém o lock e a
  conexão durante a chamada externa.

## Consequências

- Pagar duas vezes com chaves diferentes uma reserva já paga dá 409
  (`reservation_not_payable`): a chave protege o retry, a regra da reserva protege o
  resto.
- O passo B atualiza o `payment` sem checar se a reconciliação já o resolveu. A Task 42
  deve usar `UPDATE ... WHERE status = 'pending'` ou travar a linha.
- As chaves vivem 24 h; a limpeza das vencidas entra na Task 43.
- Limitações: gateway simulado (nada é cobrado); sem webhook do gateway (a reconciliação
  consulta); sem rate limit em `/pay` até a Fase 6.
