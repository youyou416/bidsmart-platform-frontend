export interface Envelope<T> {
  code: string
  message: string
  data: T
  traceId: string
}
export interface CsrfToken {
  token: string
  headerName: string
}
export interface CurrentUser {
  id: string
  username: string
  displayName: string
  department: { id: string; name: string } | null
  enterpriseId?: string | null
  identityType: string
  roles: { id: string; name: string }[]
  permissions: string[]
  firstPasswordChangeRequired: boolean
}
export interface MenuResource {
  id: string
  parentId: string | null
  name: string
  type: 'DIRECTORY' | 'MENU' | 'BUTTON'
  routeName: string | null
  path: string | null
  component: string | null
  icon: string | null
  visible: boolean
  enabled: boolean
  permission: string | null
  children: MenuResource[]
}
export interface PublicConfig {
  systemName: string
  logoPath: string | null
  themeColor: string
  tabsEnabled: boolean
}

export interface CaptchaChallenge {
  captchaId: string
  imageDataUrl: string
  expiresAt: string
  expiresInSeconds: number
}
