# ADR 0001: Monólito modular

- Status: aceito
- Data: 2026-10-18

## Contexto

O sistema vende passagens de ônibus com reserva de assento por trecho. A exigência
central é consistência sob concorrência: dois passageiros nunca compram o mesmo
assento no mesmo trecho. O projeto é desenvolvido por uma pessoa e tem seis áreas:
usuários, catálogo, reservas, pagamentos, tempo real e telas.

## Decisão

Um único serviço FastAPI dividido em módulos (monólito modular):

- Cada módulo é dono dos seus models e segue `router` → `service` → banco, com a
  transação no `service`.
- As dependências vão em um só sentido: `booking` depende de `catalog`, e `payments`
  depende de `booking`. Nunca o contrário.
- O PostgreSQL é a fonte da verdade.
- O Redis não guarda verdade. Serve só como canal de avisos (pub/sub) para o mapa
  em tempo real. Se cair, nenhuma reserva se perde.

## Alternativas descartadas

- **Microsserviços.** Reserva e pagamento precisam de consistência forte. Separá-los
  exigiria transações distribuídas (sagas), uma complexidade desproporcional para o
  tamanho do projeto e sem ganho de escala que a justifique.
- **Monólito sem fronteiras.** É mais rápido no início, mas acopla as regras, dificulta
  os testes e torna cara qualquer extração futura de um módulo.
- **Redis como fonte de verdade dos assentos.** Perderia dados numa falha e duplicaria
  a garantia que o `UNIQUE` do banco já oferece (decisão registrada na Fase 2).

## Consequências

- Uma única transação do PostgreSQL cobre reserva e pagamento, e a concorrência pode
  ser testada no `service`, sem HTTP.
- O deploy é simples: um serviço.
- A escala é de uma unidade só. Se um módulo precisar escalar sozinho, será extraído
  depois, e as fronteiras atuais facilitam isso.
- Exige disciplina para manter as fronteiras: um módulo não acessa o banco de outro.
