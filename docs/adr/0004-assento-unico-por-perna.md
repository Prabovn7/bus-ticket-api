# ADR 0004: Um assento por perna, garantido pelo banco com UNIQUE e ON CONFLICT

- Status: aceito
- Data: 2026-11-02 (decisões de 2026-10-17 e 2026-10-27; experimento de 2026-11-01)

## Contexto

O projeto promete que dois passageiros nunca compram o mesmo assento no mesmo trecho.
Vários processos e threads atendem pedidos ao mesmo tempo, então "ler e depois gravar"
em Python não basta: entre a leitura e a gravação outro pedido pode entrar. A regra
precisa valer com 100 pedidos simultâneos no mesmo assento e continuar valendo quando a
Fase 4 permitir trechos parciais (A→B, B→C e A→C no mesmo ônibus).

## Decisão

- **Uma linha por assento e por perna.** `seat_legs(trip_id, seat_number, leg_index,
  reservation_id, expires_at)`. A perna `k` liga a parada `k` à `k + 1`: uma reserva da
  parada 1 à 4 ocupa as pernas 1, 2 e 3. Existir a linha significa "ocupado".
- **`UNIQUE(trip_id, seat_number, leg_index)`.** A restrição compara a tupla inteira,
  então o mesmo assento pode ser vendido em pernas diferentes (um passageiro de A a B e
  outro de B a C) e só colide quando duas reservas querem a mesma perna.
- **O banco decide.** Cada perna entra com uma única instrução, que verifica e grava ao
  mesmo tempo:

```sql
INSERT INTO seat_legs (trip_id, seat_number, leg_index, reservation_id, expires_at)
VALUES (:trip, :seat, :leg, :res, :expires)
ON CONFLICT (trip_id, seat_number, leg_index) DO UPDATE
  SET reservation_id = EXCLUDED.reservation_id, expires_at = EXCLUDED.expires_at
  WHERE seat_legs.expires_at IS NOT NULL AND seat_legs.expires_at < :now
RETURNING leg_index;
```

  Se duas transações tentam a mesma perna, a segunda espera a primeira terminar no
  índice único e então reavalia. Se nenhuma linha volta, o assento é de outro.
- **Tudo ou nada.** Se qualquer perna não devolve linha, o serviço faz `ROLLBACK` (a
  reserva e as pernas já inseridas somem) e levanta `SeatUnavailable` (`409`). O
  serviço é dono da transação: faz o `COMMIT` no sucesso.
- **Pernas em ordem crescente.** Duas transações que pedem pernas em ordens opostas
  poderiam segurar uma cada e esperar a outra para sempre; na mesma ordem, uma só espera
  a outra.
- **Expiração preguiçosa.** O `WHERE` do `DO UPDATE` deixa o comprador seguinte retomar
  uma perna cujo hold venceu. Pernas pagas têm `expires_at` nulo e nunca são retomadas.
  O relógio é injetado (`Clock`), então os testes não usam `sleep`.
- **Teste-chave.** `tests/booking/test_hold_service.py`: 100 compradores diferentes
  disputam o mesmo assento do trecho completo e exatamente 1 vence, com 99
  `SeatUnavailable`, 1 reserva e 3 linhas em `seat_legs`.

## O experimento: a saída vermelha

Antes do serviço correto, foi escrito um hold ingênuo: um `SELECT` conta as pernas
ocupadas e, se der zero, um `INSERT` grava a reserva e as três pernas. Para a
experiência, a `UNIQUE` foi retirada do banco de teste (e devolvida no fim). Cem
compradores disputaram o assento 7 do trecho completo, com 40 conexões simultâneas. O
teste afirma `sucessos == 1` e falhou nas duas execuções registradas:

```text
NAIVE RESULT: 23 successes out of 100; 69 rows in seat_legs
E       assert 23 == 1
```

Na outra execução, `assert 19 == 1`. O número muda a cada vez, porque depende de
quantos `SELECT` terminam antes do primeiro `COMMIT`; o que não muda é que passa de 1.
Uma transação comum não impede isso: o `SELECT` não trava nada e vê o banco sem os
dados ainda não confirmados das outras transações. Nem `SELECT ... FOR UPDATE` ajudaria,
porque assento livre é ausência de linha, e não há o que travar.

O hold ingênuo e esse teste vermelho não estão no Git (decisão de 2026-10-27: só a
versão correta entra no histórico). Este registro mostra que o teste detecta o bug.

## Alternativas descartadas

- **`SELECT ... FOR UPDATE` nas pernas.** Não trava o que não existe: assento livre não
  tem linha.
- **Travar a linha da viagem (`FOR UPDATE` em `trips`).** Correto, mas serializa todos os
  compradores da viagem, mesmo de assentos diferentes, e a garantia depende de cada
  caminho de código lembrar de travar.
- **Advisory lock (`pg_advisory_xact_lock`).** Granularidade fina, mas é uma convenção da
  aplicação: um caminho que esqueça o lock reabre o bug. A `UNIQUE` vale para qualquer
  caminho, inclusive um script manual.
- **Isolamento `SERIALIZABLE`.** O banco detectaria o conflito, mas aborta transações e
  exige repetir; sob disputa alta haveria muitos abortos, inclusive de compradores de
  outros assentos.
- **Lock otimista com coluna de versão.** Não há linha para versionar quando o assento
  está livre.
- **Lock distribuído no Redis.** Um segundo sistema na regra mais importante. Se o lock
  expirar antes do `COMMIT` ou o Redis cair, dois compradores ganham. O Redis fica só
  como canal de avisos (spec, seção 3).

## Consequências

- O banco é a fonte da verdade e a garantia vale com qualquer número de processos da
  API. O vencedor é decidido sem `sleep`, tentativa repetida ou lock em Python.
- Sob disputa, os perdedores esperam o primeiro terminar antes de receber `409`. É o
  custo de decidir no índice único.
- Cada reserva escreve uma linha por perna (3 no trecho completo do seed).
- **O banco não garante tudo.** `origin_position` e `destination_position` existirem em
  `route_stops`, `seat_number <= capacity` e `seat_legs.trip_id` ser o mesmo da reserva
  dona são validados no `service`. Melhoria futura: chave estrangeira composta.
- `reservations.expires_at` e `seat_legs.expires_at` são duas cópias; a verdade da
  expiração é a das pernas (spec, seção 4).
- Um hold vencido continua com `status = held` na reserva até a expiração ativa (Fase
  2, branch 3). Quem manda no assento é a linha de `seat_legs`.
- **O teste usa 40 conexões, não 100.** O PostgreSQL padrão aceita 100 conexões, e 100
  threads com uma conexão cada, mais as do resto da suíte, estourariam o limite. O teste
  usa um pool dedicado de 40 (`max_overflow=0`) e os demais pedidos esperam uma
  conexão. A garantia continua provada, mas com 40 transações realmente simultâneas.
- Na Fase 2 o hold cobre só o trecho completo. O `SUM` do preço ignora `NULL`: para o
  trecho completo é seguro, porque só a última parada tem preço nulo e ela fica de fora
  da soma; a Fase 4 precisa revisar isso para trechos parciais.
