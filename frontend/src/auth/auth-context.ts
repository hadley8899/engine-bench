import { createContext } from 'react'
import type { Company, Role, User } from '../types/auth'

type AuthContextValue = {
  user: User | null
  company: Company | null
  role: Role | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, confirmation: string) => Promise<{ message: string }>
  resendVerification: (email: string) => Promise<{ message: string }>
  logout: () => Promise<void>
  clearLocalSession: () => void
  forgotPassword: (email: string) => Promise<{ token?: string }>
  resetPassword: (payload: { email: string; token: string; password: string; confirmation: string }) => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export type { AuthContextValue }
export { AuthContext }
