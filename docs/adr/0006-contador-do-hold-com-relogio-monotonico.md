# ADR 0006: O contador do hold usa segundos do servidor e um relógio monotônico

- Status: aceito
- Data: 2026-11-02 (decisão do Pablo, Task 33 da Fase 2)

## Contexto

O passageiro precisa ver quanto tempo resta do hold de 10 minutos. O servidor guarda
`expires_at` (um instante absoluto, em UTC). Mostrar a contagem no navegador exige
decidir de qual relógio ela depende.

Dois fatos pesam. Primeiro, o relógio do computador do usuário é dele: pode estar
adiantado, atrasado, em outro fuso ou ser ajustado no meio da contagem. Segundo, abas em
segundo plano têm os timers (`setInterval`) estrangulados pelo navegador, então contar
"um segundo a cada tick" faz o contador ficar para trás.

## Decisão

- **O servidor manda `expires_in_seconds`**, calculado com o relógio dele
  (`max(0, int(...))`: arredonda para baixo e nunca é negativo, para não prometer mais
  tempo do que existe). `expires_at` continua na resposta, mas o front não o usa para
  contar.
- **O navegador fixa um prazo uma vez:** `deadline = performance.now() + segundos * 1000`.
  `performance.now()` é monotônico: não anda para trás nem muda quando o usuário ajusta a
  hora do sistema.
- **O tick só lê o que falta.** A cada 250 ms o hook calcula
  `ceil((deadline - performance.now()) / 1000)`. Ele não decrementa um contador. Se a aba
  ficou dormindo, o próximo tick já mostra o valor certo.
- **O estado só muda quando o número muda** (atualização funcional), então o tick de
  250 ms não renderiza a tela 4 vezes por segundo. Em 0 o intervalo é limpo.
- **Expirado é derivado:** `segundos === 0` troca o painel por "Sua reserva expirou".
  Não há `setState` dentro de efeito para isso.
- **Acessibilidade:** o anúncio "reservado para você" é um `role="status"`, lido uma vez.
  O contador não é uma região viva (leria a cada segundo); é um `<time>` com
  `dateTime="PT{n}S"`.

## Alternativas descartadas

- **Contar com `expires_at - Date.now()`.** Depende do relógio do usuário. Com o relógio
  5 minutos adiantado, o hold "expira" na tela no meio do prazo; atrasado, a tela promete
  tempo que o servidor já tirou.
- **Decrementar um contador a cada `setInterval` de 1 s.** Acumula atraso em aba em
  segundo plano e sob carga da CPU.
- **Sincronizar relógios (NTP simplificado, cabeçalho `Date`).** Mais código e mais
  estados de erro para ganhar uma precisão que o contador não precisa.
- **Atualizar o contador por SSE.** O SSE entra na Fase 5, para o mapa de assentos. Para o
  contador, o prazo local basta.

## Consequências

- O contador é aproximado: ignora a latência da resposta (o navegador pode mostrar
  algumas centenas de milissegundos a mais do que o servidor tem). Quem decide é sempre o
  servidor: um `POST` depois do prazo falha mesmo que a tela ainda mostre 00:01.
- Um hold novo reinicia o hook (a chave é o objeto `hold`), então não sobra leitura do
  hold anterior.
- Recarregar a página perde o hold da tela. Ainda não existe um `GET` do hold atual; isso
  vem com o pagamento (Fase 3).
- Os testes usam `vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })`.
  O `setTimeout` fica real para o `user-event` funcionar.
