import { http } from './http'
import type { CaptchaChallenge, CurrentUser, MenuResource, PublicConfig } from '../types/api'

export const authApi = {
  captcha: (signal?: AbortSignal) =>
    http.request<CaptchaChallenge>('/security/captcha', {
      method: 'POST',
      signal,
      notifyUnauthorized: false,
    }),
  login: (username: string, password: string, captchaId: string, captchaCode: string) =>
    http.request<CurrentUser>('/auth/login', {
      method: 'POST',
      body: { username, password, captchaId, captchaCode },
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
