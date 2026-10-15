import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth'
import { ApiError, http } from '../../api/http'
import type { CurrentUser, MenuResource } from '../../types/api'
import { bindSessionRoutes, useSessionStore } from '../session'

vi.mock('../../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    menus: vi.fn(),
    password: vi.fn(),
    publicConfig: vi.fn(),
  },
}))

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: '9007199254740993',
    username: 'synthetic-user',
    displayName: '合成账户',
    department: { id: '100', name: '合成部门' },
    identityType: 'BUYER',
    roles: [{ id: '200', name: '合成角色' }],
    permissions: ['platform:home:view'],
    firstPasswordChangeRequired: false,
    ...overrides,
  }
}
const home: MenuResource = {
  id: '300',
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
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}

let routesChanged = vi.fn<(menus: MenuResource[]) => void>()
let localStorageSpy: {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
  removeItem: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
}
let sessionStorageSpy: typeof localStorageSpy

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  routesChanged = vi.fn<(menus: MenuResource[]) => void>()
  bindSessionRoutes(routesChanged)
  localStorageSpy = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() }
  sessionStorageSpy = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() }
  vi.stubGlobal('localStorage', localStorageSpy)
  vi.stubGlobal('sessionStorage', sessionStorageSpy)
  vi.spyOn(http, 'clearCsrf')
  vi.spyOn(http, 'refreshCsrf').mockResolvedValue({
    token: 'synthetic-token',
    headerName: 'X-CSRF-TOKEN',
  })
  vi.mocked(authApi.me).mockResolvedValue(user())
  vi.mocked(authApi.menus).mockResolvedValue([home])
  vi.mocked(authApi.login).mockResolvedValue(user())
  vi.mocked(authApi.logout).mockResolvedValue(null)
  vi.mocked(authApi.password).mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('session restoration', () => {
  it('loads identity and granted menus from the server before registering routes', async () => {
    const session = useSessionStore()
    await session.restore()
    expect(session.ready).toBe(true)
    expect(session.user?.id).toBe('9007199254740993')
    expect(session.permissions).toEqual(['platform:home:view'])
    expect(session.paths).toEqual(['/home'])
    expect(routesChanged).toHaveBeenLastCalledWith([home])
  })

  it('shares an in-progress restore rather than loading two account snapshots', async () => {
    const current = deferred<CurrentUser>()
    vi.mocked(authApi.me).mockReturnValue(current.promise)
    const session = useSessionStore()
    const first = session.restore()
    const second = session.restore()
    current.resolve(user())
    await Promise.all([first, second])
    expect(authApi.me).toHaveBeenCalledTimes(1)
    expect(authApi.menus).toHaveBeenCalledTimes(1)
  })

  it('does not fetch normal menus for an account requiring its first password change', async () => {
    vi.mocked(authApi.me).mockResolvedValue(user({ firstPasswordChangeRequired: true }))
    const session = useSessionStore()
    await session.restore()
    expect(session.user?.firstPasswordChangeRequired).toBe(true)
    expect(session.menus).toEqual([])
    expect(session.paths).toEqual([])
    expect(authApi.menus).not.toHaveBeenCalled()
  })

  it('handles an anonymous 401 by clearing all session and route state', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', '会话已失效'))
    const session = useSessionStore()
    await session.restore()
    expect(session.user).toBeNull()
    expect(session.ready).toBe(true)
    expect(session.paths).toEqual([])
    expect(session.connectionError).toBe('')
    expect(routesChanged).toHaveBeenLastCalledWith([])
  })

  it('rejects transport failures with cleared authorization and a usable error state', async () => {
    const error = new ApiError(0, 'NETWORK_ERROR', '无法连接服务')
    vi.mocked(authApi.me).mockRejectedValue(error)
    const session = useSessionStore()
    await expect(session.restore()).rejects.toBe(error)
    expect(session.user).toBeNull()
    expect(session.permissions).toEqual([])
    expect(session.connectionError).toBe('无法连接服务')
  })

  it('ignores an old restore response arriving after a session reset', async () => {
    const current = deferred<CurrentUser>()
    vi.mocked(authApi.me).mockReturnValue(current.promise)
    const session = useSessionStore()
    const restoring = session.restore()
    session.reset()
    current.resolve(user())
    await restoring
    expect(session.user).toBeNull()
    expect(session.menus).toEqual([])
    expect(routesChanged).toHaveBeenLastCalledWith([])
  })
})

describe('authentication lifecycle and credential storage', () => {
  it('renews CSRF after successful login, loads current authorization, and preserves password spaces', async () => {
    const session = useSessionStore()
    await session.login('synthetic-user', '  synthetic long password  ')
    expect(authApi.login).toHaveBeenCalledWith('synthetic-user', '  synthetic long password  ')
    expect(http.refreshCsrf).toHaveBeenCalledTimes(2)
    const loginOrder = vi.mocked(authApi.login).mock.invocationCallOrder[0]!
    const renewOrder = vi.mocked(http.refreshCsrf).mock.invocationCallOrder[1]!
    const currentOrder = vi.mocked(authApi.me).mock.invocationCallOrder[0]!
    expect(renewOrder).toBeGreaterThan(loginOrder)
    expect(currentOrder).toBeGreaterThan(renewOrder)
    expect(session.user).toEqual(user())
  })

  it('clears previous user, permission, routes, and tabs before attempting another account login', async () => {
    const session = useSessionStore()
    await session.restore()
    session.visitTab('/home', '框架首页')
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', '登录失败'))
    await expect(session.login('another-user', 'synthetic-password')).rejects.toMatchObject({
      status: 401,
    })
    expect(session.user).toBeNull()
    expect(session.permissions).toEqual([])
    expect(session.paths).toEqual([])
    expect(session.tabs).toEqual([])
    expect(routesChanged).toHaveBeenLastCalledWith([])
  })

  it('clears identity, routes, permissions, and tabs after server logout and renews CSRF', async () => {
    const session = useSessionStore()
    await session.restore()
    session.visitTab('/home', '框架首页')
    await session.logout()
    expect(authApi.logout).toHaveBeenCalledTimes(1)
    expect(session.user).toBeNull()
    expect(session.permissions).toEqual([])
    expect(session.menus).toEqual([])
    expect(session.tabs).toEqual([])
    expect(routesChanged).toHaveBeenLastCalledWith([])
    expect(http.refreshCsrf).toHaveBeenCalledTimes(1)
  })

  it('forces reauthentication after a successful password change', async () => {
    const session = useSessionStore()
    await session.restore()
    await session.changePassword('  original password  ', '  new synthetic password  ')
    expect(authApi.password).toHaveBeenCalledWith(
      '  original password  ',
      '  new synthetic password  ',
    )
    expect(session.user).toBeNull()
    expect(session.paths).toEqual([])
    expect(http.refreshCsrf).toHaveBeenCalledTimes(1)
  })

  it('never persists credentials, identity, or authorization in browser storage', async () => {
    const session = useSessionStore()
    await session.login('synthetic-user', 'synthetic-login-secret')
    await session.changePassword('synthetic-login-secret', 'synthetic-new-secret')
    await session.login('synthetic-user', 'synthetic-new-secret')
    await session.logout()
    for (const storage of [localStorageSpy, sessionStorageSpy]) {
      expect(storage.getItem).not.toHaveBeenCalled()
      expect(storage.setItem).not.toHaveBeenCalled()
      expect(storage.removeItem).not.toHaveBeenCalled()
      expect(storage.clear).not.toHaveBeenCalled()
    }
    expect(JSON.stringify(session.$state)).not.toContain('synthetic-login-secret')
    expect(JSON.stringify(session.$state)).not.toContain('synthetic-new-secret')
  })

  it('does not restore a stale login after the user has reset the session', async () => {
    const login = deferred<CurrentUser>()
    vi.mocked(authApi.login).mockReturnValue(login.promise)
    const session = useSessionStore()
    const signingIn = session.login('synthetic-user', 'synthetic-secret')
    await vi.waitFor(() => {
      expect(authApi.login).toHaveBeenCalledTimes(1)
    })
    const rejected = expect(signingIn).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
    session.reset()
    login.resolve(user())
    await rejected
    expect(session.user).toBeNull()
    expect(session.permissions).toEqual([])
    expect(session.paths).toEqual([])
    expect(routesChanged).toHaveBeenLastCalledWith([])
    expect(authApi.me).not.toHaveBeenCalled()
  })

  it('does not clear a newer account when an older logout finishes late', async () => {
    const session = useSessionStore()
    await session.restore()
    const logout = deferred<null>()
    vi.mocked(authApi.logout).mockReturnValue(logout.promise)
    const signingOut = session.logout()
    session.reset(false)
    const replacement = user({ id: '9007199254740994', username: 'replacement-account' })
    vi.mocked(authApi.me).mockResolvedValue(replacement)
    await session.restore()
    logout.resolve(null)
    await signingOut
    expect(session.user).toEqual(replacement)
    expect(session.paths).toEqual(['/home'])
    expect(routesChanged).toHaveBeenLastCalledWith([home])
    expect(http.refreshCsrf).not.toHaveBeenCalled()
  })

  it('does not clear a newer account when an older password change finishes late', async () => {
    const session = useSessionStore()
    await session.restore()
    const password = deferred<null>()
    vi.mocked(authApi.password).mockReturnValue(password.promise)
    const changing = session.changePassword('synthetic-old', 'synthetic-new')
    session.reset(false)
    const replacement = user({ id: '9007199254740994', username: 'replacement-account' })
    vi.mocked(authApi.me).mockResolvedValue(replacement)
    await session.restore()
    password.resolve(null)
    await changing
    expect(session.user).toEqual(replacement)
    expect(session.paths).toEqual(['/home'])
    expect(routesChanged).toHaveBeenLastCalledWith([home])
    expect(http.refreshCsrf).not.toHaveBeenCalled()
  })

  it('keeps tabs limited to authorized routes and removes duplicates', async () => {
    const session = useSessionStore()
    await session.restore()
    session.visitTab('/not-granted', '未知页面')
    session.visitTab('/home', '框架首页')
    session.visitTab('/home', '再次访问')
    expect(session.tabs).toEqual([{ path: '/home', title: '框架首页' }])
    session.closeTab('/home')
    expect(session.tabs).toEqual([])
  })
})
