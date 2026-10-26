import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../auth/authContext'

/** Valor de AuthContext pronto para testes: anônimo, com login e logout simulados. */
export function fakeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'anonymous',
    user: null,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

/** Devolve um wrapper para o render() que entrega o AuthContext sem chamar a API. */
export function authWrapper(value: AuthContextValue) {
  return function AuthWrapper({ children }: { children: ReactNode }) {
    return <AuthContext value={value}>{children}</AuthContext>
  }
}
