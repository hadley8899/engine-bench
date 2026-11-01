import { api } from '../api/api'
import type { CompanyUser } from '../types/company'

export const setupCompany = async (name: string) => {
  const { data } = await api.post('/api/auth/company/setup', { name })
  return data
}

export const listCompanyUsers = async () => {
  const { data } = await api.get<{ users: CompanyUser[] }>('/api/auth/company/users')
  return data.users
}

export const addCompanyUser = async (payload: { name: string; email: string; role: 'admin' | 'user' }) => {
  await api.post('/api/auth/company/users', payload)
}

export const updateCompanyUser = async (
  uuid: string,
  payload: { name?: string; email?: string; role?: 'admin' | 'user' },
) => {
  await api.patch(`/api/auth/company/users/${uuid}`, payload)
}

export const removeCompanyUser = async (uuid: string) => {
  await api.delete(`/api/auth/company/users/${uuid}`)
}

export const updateCompany = async (payload: { name: string }) => {
  const { data } = await api.patch('/api/auth/company', payload)
  return data
}
