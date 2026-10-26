# ADR 0003: Autenticação com access token curto e refresh token rotativo

- Status: aceito
- Data: 2026-10-25 (decisões de 2026-10-19 e 2026-10-20)

## Contexto

O passageiro precisa de conta e login. O front é uma SPA, então o navegador guarda a
credencial, e o risco muda de lugar: um XSS lê o que o JavaScript alcança, e um CSRF
envia o que o navegador anexa sozinho. O sistema também precisa permitir logout de
verdade e detectar o roubo de uma credencial de longa duração.

## Decisão

Duas credenciais, com papéis diferentes:

- **Access token:** JWT assinado com HS256, validade de 15 minutos, só em memória no
  navegador (nunca em `localStorage`). Ao decodificar, o algoritmo é fixo (`algorithms`
  lista só `HS256`, o que bloqueia `alg: none`) e `exp` e `sub` são obrigatórios. O
  `sub` é texto, como manda a especificação do JWT.
- **Refresh token:** valor opaco e aleatório (`secrets.token_urlsafe(32)`). O banco
  guarda só o SHA-256 dele, então um vazamento da tabela não entrega tokens usáveis.
  Viaja num cookie `HttpOnly`, `SameSite=Strict`, com `Path=/api/auth` e `Secure`
  configurável. A validade é de 24 horas deslizantes: cada renovação emite um token
  novo com nova validade.
- **Rotação atômica.** Renovar é um único `UPDATE ... SET used_at WHERE used_at IS NULL
  AND revoked_at IS NULL AND expires_at > agora RETURNING ...`. Só uma requisição
  consegue virar o `used_at`, então o banco decide quem usa o token, sem checar e
  depois gravar. O mesmo princípio vale para o cadastro (`UNIQUE` no e-mail) e vai
  valer para os assentos.
- **Reuso revoga a família.** Todo token pertence a uma família (um login). Se um
  token já usado reaparece, trata-se como roubo e todos os tokens daquela família são
  revogados. O logout também revoga a família e limpa o cookie.
- **Senhas com Argon2id.** O login compara contra um hash fictício quando o e-mail não
  existe, para gastar o mesmo tempo, e responde uma mensagem única (`401`) para e-mail
  inexistente e senha errada.
- **No navegador, uma renovação por vez.** O cliente reaproveita a mesma chamada de
  renovação enquanto ela está em voo (zerada no `finally`), porque duas renovações
  simultâneas com o mesmo cookie disparariam a revogação da família. `authedFetch`
  envia o access token e, em caso de `401`, renova e repete a chamada uma única vez. Ele
  fica num arquivo separado do cliente da API para não criar um ciclo de importação
  (`client` → `authApi` → `client`). Ao recarregar a página, o `AuthProvider` chama
  `/refresh` para recuperar a sessão.

## Alternativas descartadas

- **JWT longo em `localStorage`.** Simples, mas qualquer XSS rouba uma credencial que
  vale por dias.
- **Só cookie de sessão, sem JWT.** Exigiria estado de sessão no servidor (por exemplo
  no Redis), que o projeto reserva para avisos e não para verdade.
- **Refresh token em JWT.** Seria difícil de revogar e de detectar reuso sem guardar
  estado de qualquer forma.
- **Refresh sem rotação.** Um token roubado valeria até expirar, sem que ninguém
  percebesse.
- **Access token de longa duração.** Reduz a necessidade de renovar, mas amplia a
  janela de uso de um token vazado, já que ele não pode ser revogado.

## Consequências

- Um XSS ainda consegue chamar a API enquanto a página estiver aberta, mas não leva
  consigo uma credencial que sobreviva ao fechamento dela: o refresh é inacessível ao
  JavaScript. O `SameSite=Strict` e o `Path` restrito protegem o cookie contra CSRF, e
  não há CORS com credenciais porque a origem é uma só (ver ADR 0002).
- **O access token não é revogável antes do `exp`.** O logout derruba o refresh, mas um
  access já emitido vale até 15 minutos.
- **Duas abas renovando ao mesmo tempo.** O voo único existe na memória de cada aba, e o
  cookie é compartilhado. Se as duas renovarem juntas, a segunda parece reuso e revoga a
  família. Melhorias: `navigator.locks` ou `BroadcastChannel` no front, ou uma janela de
  tolerância no backend.
- Um `401` recebido depois de outra requisição já ter renovado renova de novo. É
  redundante, mas seguro.
- **Sem limite de tentativas** no login, cadastro e renovação. O custo de memória do
  Argon2 por login torna isso relevante: precisa entrar antes de qualquer deploy
  (Fase 6, com Redis).
- **Sem teto absoluto de sessão:** a validade é deslizante, então quem usa o sistema
  todo dia nunca é deslogado. A tabela `refresh_tokens` não tem limpeza de tokens
  expirados, e há um único `JWT_SECRET`, sem rotação de chaves.
- **O cadastro revela se o e-mail já existe** (`409`). O login não revela. A escolha
  foi aceitar isso no cadastro, porque a alternativa (confirmar por e-mail) está fora do
  escopo; o limite de tentativas reduz o abuso.
- O padrão de `COOKIE_SECURE` é `False`, para o desenvolvimento em HTTP. Em produção
  precisa ser `True`. A correção prevista é inverter o padrão e deixar o `.env` local
  com `false`.
- As telas Entrar e Criar conta não redirecionam quem já está autenticado.
