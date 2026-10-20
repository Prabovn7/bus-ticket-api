// O access token vive só nesta variável. Nunca vai para localStorage, sessionStorage,
// URL ou log: recarregar a página apaga o token e o cookie HttpOnly traz a sessão de volta.
let accessToken: string | null = null

export const tokenStore = {
  get(): string | null {
    return accessToken
  },
  set(token: string): void {
    accessToken = token
  },
  clear(): void {
    accessToken = null
  },
}
