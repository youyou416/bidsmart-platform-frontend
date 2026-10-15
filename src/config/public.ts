import type { PublicConfig } from '../types/api'

const apiBase = import.meta.env.VITE_API_BASE || '/api/v1'
if (!/^\/api\/v1\/?$/.test(apiBase)) throw new Error('API 地址必须为本站 /api/v1 相对路径')
export const API_BASE = apiBase.replace(/\/$/, '')
export const defaultPublicConfig: PublicConfig = {
  systemName: import.meta.env.VITE_SYSTEM_NAME || '智采 · 平台基础框架',
  logoPath: '/mark.svg',
  themeColor: '#087f78',
  tabsEnabled: import.meta.env.VITE_ENABLE_TABS !== 'false',
}
export function safePublicConfig(config: PublicConfig): PublicConfig {
  return {
    systemName: config.systemName?.slice(0, 80) || defaultPublicConfig.systemName,
    logoPath:
      config.logoPath &&
      /^\/[a-zA-Z0-9_./-]+\.(svg|png|webp)$/.test(config.logoPath) &&
      !config.logoPath.includes('..')
        ? config.logoPath
        : '/mark.svg',
    themeColor: /^#[a-fA-F0-9]{6}$/.test(config.themeColor) ? config.themeColor : '#087f78',
    tabsEnabled: config.tabsEnabled === true,
  }
}
