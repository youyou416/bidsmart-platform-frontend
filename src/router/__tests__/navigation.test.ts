import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import type { CurrentUser, MenuResource } from '../../types/api'

const api = vi.hoisted(() => ({
  me: vi.fn(),
  menus: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  password: vi.fn(),
  publicConfig: vi.fn(),
}))
vi.mock('../../api/auth', () => ({ authApi: api }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: actual.createMemoryHistory }
})
vi.mock('../../views/HomeView.vue', () => ({ default: { render: () => null } }))
vi.mock('../../views/LoginView.vue', () => ({ default: { render: () => null } }))
vi.mock('../../views/PasswordView.vue', () => ({ default: { render: () => null } }))
vi.mock('../../views/StatusView.vue', () => ({ default: { render: () => null } }))
vi.mock('../../layout/AppLayout.vue', () => ({ default: { render: () => null } }))

const currentUser: CurrentUser = {
  id: '9007199254740993',
  username: 'synthetic-user',
  displayName: '合成账户',
  department: null,
  identityType: 'BUYER',
  roles: [{ id: '2', name: '合成角色' }],
  permissions: ['platform:home:view'],
  firstPasswordChangeRequired: false,
}
const home: MenuResource = {
  id: '3',
  parentId: null,
  name: '框架首页',
  type: 'MENU',
  routeName: 'Home',
  path: '/home',
  component: 'Home',
  icon: null,
  visible: true,
  enabled: true,
  permission: 'platform:home:view',
  children: [],
}
let router: Router
let session: ReturnType<(typeof import('../../stores/session'))['useSessionStore']>

beforeEach(async () => {
  vi.resetAllMocks()
  vi.resetModules()
  api.me.mockResolvedValue(currentUser)
  api.menus.mockResolvedValue([home])
  const pinia = createPinia()
  setActivePinia(pinia)
  const routing = await import('../index')
  const stores = await import('../../stores/session')
  router = routing.router
  session = stores.useSessionStore(pinia)
  routing.installSessionRouting(pinia)
})

describe('authorization routing on initial navigation', () => {
  it('restores current identity and dynamic routes when directly opening an authorized page', async () => {
    await router.push('/home')
    expect(api.me).toHaveBeenCalledTimes(1)
    expect(api.menus).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('Home')
    expect(router.currentRoute.value.path).toBe('/home')
    expect(session.tabs).toEqual([{ path: '/home', title: '框架首页' }])
  })

  it('redirects anonymous visits to login with an internal whitelist return destination', async () => {
    const { ApiError } = await import('../../api/http')
    api.me.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', '会话已失效'))
    await router.push('/home')
    expect(router.currentRoute.value.name).toBe('Login')
    expect(router.currentRoute.value.query.returnTo).toBe('/home')
    expect(session.user).toBeNull()
  })

  it('returns 403 when a known page has no grant', async () => {
    api.me.mockResolvedValue({ ...currentUser, permissions: [] })
    api.menus.mockResolvedValue([])
    await router.push('/home')
    expect(router.currentRoute.value.name).toBe('Forbidden')
    expect(router.hasRoute('Home')).toBe(false)
  })

  it('cannot bypass a disabled menu by entering its path manually', async () => {
    api.menus.mockResolvedValue([{ ...home, enabled: false }])
    await router.push('/home')
    expect(router.currentRoute.value.name).toBe('Forbidden')
    expect(router.hasRoute('Home')).toBe(false)
  })

  it('keeps hidden but authorized pages routable', async () => {
    api.menus.mockResolvedValue([{ ...home, visible: false }])
    await router.push('/home')
    expect(router.currentRoute.value.name).toBe('Home')
  })

  it('requires first password change before resolving an ordinary page', async () => {
    api.me.mockResolvedValue({ ...currentUser, firstPasswordChangeRequired: true })
    await router.push('/home')
    expect(router.currentRoute.value.name).toBe('Password')
    expect(api.menus).not.toHaveBeenCalled()
    expect(router.hasRoute('Home')).toBe(false)
  })

  it('returns 404 for an unknown page', async () => {
    await router.push('/not-developed')
    expect(router.currentRoute.value.meta.status).toBe(404)
    expect(router.currentRoute.value.meta.resourceId).toBeUndefined()
  })

  it('removes installed account routes and tabs when the session is reset', async () => {
    await router.push('/home')
    expect(router.hasRoute('Home')).toBe(true)
    session.reset()
    expect(router.hasRoute('Home')).toBe(false)
    expect(session.tabs).toEqual([])
    await router.push('/home')
    expect(router.currentRoute.value.name).toBe('Login')
  })
})
