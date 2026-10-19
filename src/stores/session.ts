import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '../api/auth'
import { ApiError, http } from '../api/http'
import { flattenMenus, sanitizeMenus } from '../router/menu'
import type { CurrentUser, MenuResource } from '../types/api'

let routesChanged: (menus: MenuResource[]) => void = () => {}
export function bindSessionRoutes(callback: (menus: MenuResource[]) => void) {
  routesChanged = callback
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<CurrentUser | null>(null)
  const menus = ref<MenuResource[]>([])
  const ready = ref(false)
  const connectionError = ref('')
  const tabs = ref<{ path: string; title: string }[]>([])
  const permissions = computed(() => user.value?.permissions || [])
  const paths = computed(() => flattenMenus(menus.value).map((menu) => menu.path!))
  let restoring: Promise<void> | null = null
  let generation = 0

  function reset(markReady = true) {
    generation++
    user.value = null
    menus.value = []
    tabs.value = []
    ready.value = markReady
    connectionError.value = ''
    restoring = null
    http.clearCsrf()
    routesChanged([])
  }

  async function loadCurrent(expectedGeneration: number) {
    const current = await authApi.me()
    const resources = current.firstPasswordChangeRequired ? [] : await authApi.menus()
    if (expectedGeneration !== generation) return
    user.value = current
    menus.value = sanitizeMenus(resources, current.permissions)
    routesChanged(menus.value)
    ready.value = true
    connectionError.value = ''
  }

  async function restore() {
    if (ready.value) return
    if (restoring) return restoring
    const expectedGeneration = generation
    restoring = loadCurrent(expectedGeneration)
      .catch((error: unknown) => {
        if (expectedGeneration !== generation) return
        reset()
        if (!(error instanceof ApiError && error.status === 401)) {
          connectionError.value = error instanceof ApiError ? error.message : '暂时无法恢复会话'
          throw error
        }
      })
      .finally(() => {
        if (expectedGeneration === generation) restoring = null
      })
    return restoring
  }

  async function login(username: string, password: string, captchaId: string, captchaCode: string) {
    reset(false)
    const expectedGeneration = generation
    const verify = () => {
      if (expectedGeneration !== generation)
        throw new ApiError(0, 'SESSION_CHANGED', '会话状态已更新，请重新操作')
    }
    await http.refreshCsrf()
    verify()
    await authApi.login(username, password, captchaId, captchaCode)
    verify()
    await http.refreshCsrf()
    verify()
    await loadCurrent(expectedGeneration)
  }

  async function logout() {
    const expectedGeneration = generation
    await authApi.logout()
    if (expectedGeneration !== generation) return
    reset()
    await http.refreshCsrf()
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const expectedGeneration = generation
    await authApi.password(currentPassword, newPassword)
    if (expectedGeneration !== generation) return
    reset()
    await http.refreshCsrf()
  }

  function visitTab(path: string, title: string) {
    if (paths.value.includes(path) && !tabs.value.some((tab) => tab.path === path))
      tabs.value.push({ path, title })
  }
  function closeTab(path: string) {
    tabs.value = tabs.value.filter((tab) => tab.path !== path)
  }

  return {
    user,
    menus,
    ready,
    connectionError,
    tabs,
    permissions,
    paths,
    reset,
    restore,
    login,
    logout,
    changePassword,
    visitTab,
    closeTab,
  }
})
