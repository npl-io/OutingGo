import { createContext } from 'react'
import type { User } from '../api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface RegisterInput {
  email: string
  password: string
  fullName: string
  phone?: string
}

export interface AuthContextValue {
  user: User | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
