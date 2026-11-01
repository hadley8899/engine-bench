import { tokenStorageKey } from '../config'
import axios from 'axios'
import { AUTH_SESSION_INVALIDATED_EVENT } from '../auth/sessionEvents'
import { notifyError } from '../services/toastService'

export const baseURL = import.meta.env.VITE_API_URL ?? ''

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(tokenStorageKey)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type']
    delete config.headers['content-type']
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const authorizationHeader = error?.config?.headers?.Authorization
    if (error?.response?.status === 401 && typeof authorizationHeader === 'string' && authorizationHeader !== '') {
      localStorage.removeItem(tokenStorageKey)
      window.dispatchEvent(new Event(AUTH_SESSION_INVALIDATED_EVENT))
    }

    const message =
      (error?.response?.data?.message as string | undefined) ??
      (typeof error?.message === 'string' && error.message.trim() ? error.message : null) ??
      'Request failed.'
    notifyError(message)
    return Promise.reject(error)
  },
)
