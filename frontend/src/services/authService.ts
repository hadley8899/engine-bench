import { api } from '../api/api'
import type { Company, Role, User } from '../types/auth'

type AuthResponse = {
  user: User
  company: Company | null
  role: Role | null
}

export type ApiSession = {
  uuid: string
  display_name: string
  ip_address: string | null
  last_used_at: string | null
  expires_at: string | null
  created_at: string | null
  is_current: boolean
}

export const login = async (email: string, password: string) => {
  const { data } = await api.post<AuthResponse & { token: string }>('/api/auth/login', { email, password })
  return data
}

export const me = async () => {
  const { data } = await api.get<AuthResponse>('/api/auth/me')
  return data
}

export const register = async (payload: {
  name: string
  email: string
  password: string
  password_confirmation: string
}) => {
  const { data } = await api.post<{ message?: string }>('/api/auth/register', payload)
  return data
}

export const resendVerification = async (email: string) => {
  const { data } = await api.post<{ message?: string }>('/api/auth/email/verification-notification', { email })
  return data
}

export const logout = async () => {
  await api.post('/api/auth/logout')
}

export const getSessions = async () => {
  const { data } = await api.get<{ sessions: ApiSession[] }>('/api/auth/sessions')
  return data.sessions
}

export const deleteSession = async (sessionUuid: string) => {
  const { data } = await api.delete<{ message: string; signed_out_current_session: boolean }>(`/api/auth/sessions/${sessionUuid}`)
  return data
}

export const deleteAllSessions = async () => {
  const { data } = await api.delete<{ message: string; signed_out_sessions: number }>('/api/auth/sessions')
  return data
}

export const forgotPassword = async (email: string) => {
  const { data } = await api.post<{ token?: string }>('/api/auth/forgot-password', { email })
  return data
}

export const resetPassword = async (payload: {
  email: string
  token: string
  password: string
  password_confirmation: string
}) => {
  await api.post('/api/auth/reset-password', payload)
}
