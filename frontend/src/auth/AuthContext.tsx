import { tokenStorageKey } from '../config'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Company, Role, User } from '../types/auth'
import * as authService from '../services/authService'
import { AuthContext } from './auth-context'
import { AUTH_SESSION_INVALIDATED_EVENT } from './sessionEvents'

const TOKEN_KEY = tokenStorageKey

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const persistToken = (value: string | null) => {
    if (value) {
      localStorage.setItem(TOKEN_KEY, value)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
    setToken(value)
  }

  const refreshUser = useCallback(async () => {
    const currentToken = token ?? localStorage.getItem(TOKEN_KEY)
    if (!currentToken) {
      setUser(null)
      setCompany(null)
      setRole(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const data = await authService.me()
      setUser(data.user)
      setCompany(data.company ?? null)
      setRole(data.role ?? null)
      persistToken(currentToken)
    } catch {
      setUser(null)
      setCompany(null)
      setRole(null)
      persistToken(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshUser().catch(() => null)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const data = await authService.login(email, password)
    setUser(data.user)
    setCompany(data.company ?? null)
    setRole(data.role ?? null)
    persistToken(data.token)
  }, [])

  const clearLocalSession = useCallback(() => {
    setUser(null)
    setCompany(null)
    setRole(null)
    persistToken(null)
  }, [])

  useEffect(() => {
    window.addEventListener(AUTH_SESSION_INVALIDATED_EVENT, clearLocalSession)

    return () => window.removeEventListener(AUTH_SESSION_INVALIDATED_EVENT, clearLocalSession)
  }, [clearLocalSession])

  const register = useCallback(async (name: string, email: string, password: string, confirmation: string) => {
    const data = await authService.register({
      name,
      email,
      password,
      password_confirmation: confirmation,
    })

    setUser(null)
    setCompany(null)
    setRole(null)
    persistToken(null)
    return { message: data.message ?? 'Registration successful. Check your inbox to verify your email.' }
  }, [])

  const resendVerification = useCallback(async (email: string) => {
    const data = await authService.resendVerification(email)

    return { message: data.message ?? 'If your email is registered, a verification email has been sent.' }
  }, [])

  const logout = useCallback(async () => {
    if (!token) {
      clearLocalSession()

      return
    }

    try {
      await authService.logout()
      clearLocalSession()
    } catch {
      return
    }
  }, [clearLocalSession, token])

  const forgotPassword = useCallback((email: string) => authService.forgotPassword(email), [])

  const resetPassword = useCallback(async (payload: {
    email: string
    token: string
    password: string
    confirmation: string
  }) => {
    await authService.resetPassword({
      email: payload.email,
      token: payload.token,
      password: payload.password,
      password_confirmation: payload.confirmation,
    })
  }, [])

  const value = useMemo(
    () => ({
      user,
      company,
      role,
      token,
      loading,
      login,
      register,
      resendVerification,
      logout,
      clearLocalSession,
      forgotPassword,
      resetPassword,
      refreshUser,
    }),
    [user, company, role, token, loading, login, register, resendVerification, logout, clearLocalSession, forgotPassword, resetPassword, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
