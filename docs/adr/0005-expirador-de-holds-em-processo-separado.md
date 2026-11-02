# ADR 0005: O expirador de holds roda como um processo separado

- Status: aceito
- Data: 2026-11-02 (decisão do Pablo, Task 30 da Fase 2)

## Contexto

Um hold dura 10 minutos. A expiração preguiçosa (ADR 0004) já deixa o próximo comprador
retomar uma perna vencida, mas não toca na reserva velha: ela continua com
`status = held` e `expires_at` no passado, sem nenhuma perna ligada. A expiração ativa
(`expire_holds`, Task 29) faz essa faxina: marca a reserva como `expired` e apaga as
pernas que ainda são dela. Falta decidir **onde** isso roda, a cada 30 segundos.

Dois fatos pesam na decisão. Primeiro, o expirador é faxina, não correção: com ele
parado nenhum assento fica preso, porque o `hold_seat` retoma o que venceu. Segundo,
`expire_holds` usa `FOR UPDATE SKIP LOCKED`, então vários expiradores podem rodar ao
mesmo tempo sem se atrapalhar.

## Decisão

- **Um processo próprio:** `python -m app.booking.expirer`. A API não sabe que ele
  existe; os dois só compartilham o banco.
- **O laço.** A cada 30 s (`INTERVAL_SECONDS`) roda `expire_all_overdue`, que pede lotes
  de 100 reservas (`BATCH_SIZE`) até um lote vir incompleto. Uma sessão por lote, então
  um lote com problema não deixa transação aberta.
- **Parada limpa.** `SIGINT` (Ctrl+C) e `SIGTERM` (o `docker stop` da Fase 6) só
  levantam um `threading.Event`. O laço termina a rodada em andamento e sai. A espera
  entre rodadas é feita em fatias de no máximo 1 s, porque no Windows um `Event.wait`
  longo não é interrompido pelo Ctrl+C.
- **Falha de banco não derruba o processo.** O laço captura `SQLAlchemyError`, registra
  com o traceback e tenta de novo na rodada seguinte. Qualquer outro erro é um bug e
  derruba o processo; não há `except Exception` engolindo erro.
- **Testável sem dormir.** As funções recebem a fábrica de sessões, o `Clock` e o
  `Event` de parada. Os testes usam um `Event` que se dá por vencido depois de N
  esperas (`StopAfter`) e o `FakeClock`, então nenhum teste usa `sleep`.

## Alternativas descartadas

- **Laço dentro da API (thread no `lifespan` do FastAPI).** Um comando só sobe tudo,
  mas cada worker do `uvicorn` criaria o seu próprio laço (seguro por causa do
  `SKIP LOCKED`, porém redundante), o ciclo de vida da API ficaria acoplado ao da
  faxina e os testes da API teriam que desligar o laço.
- **Agendador (APScheduler, cron).** Uma dependência nova para um laço de poucas
  linhas. Dentro da API tem os mesmos problemas da opção anterior; fora dela, é o que
  este processo já é.
- **Só a expiração preguiçosa.** As reservas velhas ficariam `held` para sempre,
  sujando contagens e o histórico do passageiro.
- **Fila de tarefas (Celery).** Broker, worker e serialização para uma consulta SQL a
  cada 30 s. Complexidade sem ganho (ADR 0001: tecnologia chata por padrão).
- **`pg_cron` dentro do banco.** Prende a regra a uma extensão e dificulta o teste com
  relógio injetado.

## Consequências

- No desenvolvimento são dois terminais: `uvicorn` e `python -m app.booking.expirer`.
  Na Fase 6 o expirador vira um serviço `expirer` no Compose, com a mesma imagem da API.
- Dá para rodar zero, um ou vários expiradores. Zero atrasa só a faxina; vários não
  processam a mesma reserva (`SKIP LOCKED`, teste com `lock_timeout`).
- Entre um hold vencer e a reserva virar `expired` passam até cerca de 30 s (mais o
  tempo da rodada). A disponibilidade de assentos não pode depender disso: a consulta
  da Task 31 deve tratar hold vencido como livre.
- O `DELETE` filtra por `reservation_id`, não por assento. Se outro comprador retomou o
  assento antes da faxina, as pernas já são dele e o expirador não as toca.
- Se o processo morrer, nada trava e nada se perde; a faxina só atrasa até ele voltar.
  Ainda não há supervisão (a política de reinício do Compose entra na Fase 6).
- Limitações: um expirador, em um único banco; o log só registra quando algo expira ou
  falha, e não há métrica nem verificação de saúde.
