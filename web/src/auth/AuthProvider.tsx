import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '../api/types'
import { login as apiLogin, logout as apiLogout, refresh } from './authApi'
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext'
import { me } from './me'
import { tokenStore } from './tokenStore'

interface State {
  status: AuthStatus
  user: User | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading', user: null })

  useEffect(() => {
    // O StrictMode monta, desmonta e monta de novo: a primeira execução é cancelada.
    // O refresh é compartilhado (voo único) e o perfil só é pedido pela execução viva.
    let cancelled = false

    refresh()
      .then(() => (cancelled ? null : me()))
      .then((user) => {
        if (!cancelled && user) {
          setState({ status: 'authenticated', user })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'anonymous', user: null })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password)
    try {
      const user = await me()
      setState({ status: 'authenticated', user })
    } catch (error) {
      tokenStore.clear()
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setState({ status: 'anonymous', user: null })
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
