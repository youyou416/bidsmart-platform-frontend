import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { defaultPublicConfig, safePublicConfig } from '../config/public'
import { authApi } from '../api/auth'

function readCollapsed() {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('platform-ui-collapsed') === 'true'
    )
  } catch {
    return false
  }
}
export const usePreferencesStore = defineStore('preferences', () => {
  const collapsed = ref(readCollapsed())
  const config = ref(defaultPublicConfig)
  watch(collapsed, (value) => {
    try {
      localStorage.setItem('platform-ui-collapsed', String(value))
    } catch {
      /* UI preference storage is optional. */
    }
  })
  async function loadConfig() {
    try {
      config.value = safePublicConfig(await authApi.publicConfig())
    } catch {
      config.value = defaultPublicConfig
    }
    document.title = config.value.systemName
    document.documentElement.style.setProperty('--el-color-primary', config.value.themeColor)
    document.documentElement.style.setProperty('--accent', config.value.themeColor)
  }
  return { collapsed, config, loadConfig }
})
