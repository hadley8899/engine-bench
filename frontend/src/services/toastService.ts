export type ToastPayload = {
  message: string
  severity?: 'error' | 'success' | 'info' | 'warning'
  duration?: number
}

type ToastHandler = (payload: ToastPayload) => void

let toastHandler: ToastHandler | null = null

export const registerToastHandler = (handler: ToastHandler | null) => {
  toastHandler = handler
}

export const notifyToast = (payload: ToastPayload) => {
  if (toastHandler) {
    toastHandler(payload)
  }
}

export const notifyError = (message: string, duration?: number) => {
  notifyToast({ message, severity: 'error', duration })
}
