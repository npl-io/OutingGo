import { useCallback, useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch, clearToken, getToken, setToken } from '../api/client'
import { ApiError } from '../api/types'
import type { User } from '../api/types'
import { AuthContext } from './AuthContext'
import type { AuthContextValue, AuthStatus, RegisterInput } from './AuthContext'

interface MeResponse {
  user: User
}

interface LoginResponse {
  token: string
  user: User
}

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false

    async function loadMe(): Promise<void> {
      const token = getToken()
      if (!token) {
        setStatus('anonymous')
        return
      }

      try {
        const data = await apiFetch<MeResponse>('/auth/me')
        if (!cancelled) {
          setUser(data.user)
          setStatus('authenticated')
        }
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearToken()
        }
        if (!cancelled) {
          setUser(null)
          setStatus('anonymous')
        }
      }
    }

    void loadMe()

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const data = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    setToken(data.token)
    setUser(data.user)
    setStatus('authenticated')
  }, [])

  const register = useCallback(
    async (input: RegisterInput): Promise<void> => {
      await apiFetch<{ user: User }>('/auth/register', {
        method: 'POST',
        body: input,
      })
      await login(input.email, input.password)
    },
    [login],
  )

  const logout = useCallback((): void => {
    clearToken()
    setUser(null)
    setStatus('anonymous')
    queryClient.clear()
  }, [queryClient])

  const value: AuthContextValue = { user, status, login, register, logout }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
