import { api } from '../api/api'
import type { NotificationItem } from '../types/notification'

export const listNotifications = async () => {
  const { data } = await api.get<{ notifications: NotificationItem[] }>('/api/auth/notifications')
  return data.notifications
}

export const fetchUnreadNotificationCount = async () => {
  const { data } = await api.get<{ count: number }>('/api/auth/notifications/unread-count')
  return data.count
}

export const markNotificationRead = async (notificationId: string) => {
  const { data } = await api.patch<{ notification: { id: string; read_at: string | null } }>(
    `/api/auth/notifications/${notificationId}`,
  )
  return data.notification
}

export const markAllNotificationsRead = async () => {
  const { data } = await api.patch<{ marked_read_count: number }>('/api/auth/notifications/mark-all-read')
  return data
}

