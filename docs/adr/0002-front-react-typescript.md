# ADR 0002: Front em React e TypeScript dentro de `web/`

- Status: aceito
- Data: 2026-10-25 (decisões de 2026-10-18 e 2026-10-19)

## Contexto

A primeira ideia era um front servido pelo próprio FastAPI, com Jinja2 e HTMX, sem
etapa de build. O desenvolvedor reabriu a decisão para aprender o ecossistema que o
mercado usa em telas com estado (busca, login, e depois mapa de poltronas em tempo
real) e para ter animações ricas. O objetivo central do projeto continua sendo o
backend e a consistência sob concorrência, então o front precisava ficar pequeno e
não mexer em nenhuma regra de negócio.

## Decisão

O front é uma aplicação React (Vite) escrita em TypeScript, na pasta `web/` do mesmo
repositório:

- **TypeScript em modo `strict`.** Os tipos da API (`TripResult`, `ApiError`,
  `TokenResponse`) espelham os schemas do Pydantic.
- **React Router** para as rotas e **`fetch` com um hook próprio** (`useSearchTrips`)
  para buscar dados. O hook usa `AbortController` para que uma resposta antiga nunca
  sobrescreva a mais nova. TanStack Query fica para avaliar na Fase 5 (mapa de
  poltronas), depois de sentir a dor real.
- **CSS puro com tokens** (variáveis CSS para cor, espaço e tempo, em dois temas).
  Sem Tailwind. Todo efeito visual novo usa só `var(--token)`, sem cor fixa, para que a
  identidade possa ser trocada sem tocar nos componentes.
- **GSAP (`gsap` e `@gsap/react`, hook `useGSAP`)** para as animações: placa de
  horário, entrada das linhas do quadro, transição entre telas e o brilho holográfico
  em 2D. A cena do ônibus no topo das telas é SVG e CSS puros, sem vídeo nem imagem de
  terceiros.
- **Movimento reduzido** é decidido por um hook (`useReducedMotion`, feito com
  `useSyncExternalStore`) dentro de cada animação, e não por `gsap.matchMedia()`. Assim
  o componente decide o que renderizar (o botão de pausa da cena nem aparece) e o
  comportamento é testável.
- **Testes:** Vitest e Testing Library, jsdom. Sem Playwright nesta fase.
- **CI:** um job `web` (Node 24: `npm ci`, `format:check`, lint, testes e build) roda
  em paralelo ao job Python.
- **Desenvolvimento na mesma origem:** o servidor do Vite faz proxy de `/api` para o
  FastAPI. Isso importa porque o cookie do refresh token é `SameSite=Strict` (ver
  ADR 0003) e só é enviado na mesma origem, e dispensa CORS com credenciais.

A regra de negócio fica no backend. O front só apresenta: quem garante que um assento
não é vendido duas vezes continua sendo o banco.

## Alternativas descartadas

- **Jinja2 e HTMX no próprio FastAPI.** Mais simples, sem build e com um deploy só.
  Descartada porque o desenvolvedor quis aprender a arquitetura de SPA, e porque o
  mapa de poltronas em tempo real e as animações pedem estado no cliente.
- **Gerar o front com uma ferramenta de prompt (Lovable).** Descartada: o objetivo é
  aprender, então o código é escrito à mão, com ajuda para entender. No máximo serve
  de inspiração visual.
- **Repositório separado para o front.** Descartada: um repositório só facilita o CI
  único, o histórico junto e a Fase 6, que serve os dois no mesmo domínio.
- **Motion (antiga Framer Motion), ou só CSS.** O Motion tem entrada e saída de
  componentes prontas. Foi trocado pelo GSAP porque o desenvolvedor quer sequências e,
  na Fase 5, cenas 3D com Three.js, onde o GSAP rende mais.
- **Tailwind.** Descartada: os tokens em variáveis CSS já cobrem os dois temas e o
  reaproveitamento dos mockups.
- **Validação em execução da resposta da API (Zod).** Só se o custo valer. Hoje o
  cliente confia no tipo declarado (`as T`), o que é uma promessa, não uma garantia.

## Consequências

- Um repositório misto (Python e Node): `.gitignore` para `node_modules` e `web/dist`,
  CI com dois jobs, e um Dockerfile em dois estágios na Fase 6.
- **O proxy do Vite só existe em desenvolvimento.** Na Fase 6 é preciso repetir a mesma
  origem: o FastAPI servindo `web/dist`, ou um proxy reverso num domínio só.
- **Licença do GSAP.** O GSAP não é MIT. Ele usa a licença própria da Webflow,
  "Standard no charge": uso gratuito, inclusive comercial, em sites e aplicativos. A
  restrição é usar o GSAP em ferramentas que permitam criar animações visuais sem
  código e que concorram com o editor de animação da Webflow. Este projeto não é uma
  ferramenta assim, mas a licença deve ser relida a cada atualização grande.
- **Peso.** O GSAP soma cerca de 73 kB ao pacote (cerca de 28 kB comprimidos) e está no
  pacote principal. Melhoria possível: carregá-lo só nas telas que o usam, com `lazy` ou
  `import()` dinâmico.
- **Sem animação de saída entre telas.** O GSAP não tem um equivalente pronto do
  `AnimatePresence`. As telas entram com fade, mas não saem com animação.
- O script que aplica o tema antes da primeira pintura é inline, então a CSP da Fase 6
  precisa de um hash para ele (ou `unsafe-inline`).
- Não há teste visual automatizado: a aparência da placa, da cena e do contraste só é
  conferida no navegador. O contraste dos tokens é coberto por testes que leem o CSS.
- O desenvolvedor mantém um segundo ecossistema (React, TypeScript, GSAP) dentro de um
  projeto cujo ponto forte deve ser o backend. A mitigação é manter o front pequeno:
  busca, cadastro e login na Fase 1.
