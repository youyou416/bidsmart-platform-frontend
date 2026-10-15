import { http } from './http'
import type { CurrentUser, MenuResource, PublicConfig } from '../types/api'

export const authApi = {
  login: (username: string, password: string) =>
    http.request<CurrentUser>('/auth/login', {
      method: 'POST',
      body: { username, password },
      notifyUnauthorized: false,
    }),
  logout: () => http.request<null>('/auth/logout', { method: 'POST' }),
  me: () => http.request<CurrentUser>('/auth/me', { notifyUnauthorized: false }),
  menus: () => http.request<MenuResource[]>('/auth/menus'),
  password: (currentPassword: string, newPassword: string) =>
    http.request<null>('/auth/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),
  publicConfig: () =>
    http.request<PublicConfig>('/app/public-config', { notifyUnauthorized: false }),
}
