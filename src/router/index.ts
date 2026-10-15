import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import type { Pinia } from 'pinia'
import type { Component } from 'vue'
import { bindSessionRoutes, useSessionStore } from '../stores/session'
import { COMPONENT_PATHS, flattenMenus } from './menu'
import { safeReturnPath } from '../utils/permissions'
import type { MenuResource } from '../types/api'

const COMPONENTS: Readonly<Record<string, () => Promise<Component>>> = Object.freeze({
  Home: () => import('../views/HomeView.vue').then((module) => module.default),
})
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/password',
    name: 'Password',
    component: () => import('../views/PasswordView.vue'),
    meta: { title: '修改密码' },
  },
  { path: '/', name: 'Layout', component: () => import('../layout/AppLayout.vue'), children: [] },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('../views/StatusView.vue'),
    meta: { public: true, status: 403 },
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('../views/StatusView.vue'),
    meta: { public: true, status: 404 },
  },
  {
    path: '/error',
    name: 'Error',
    component: () => import('../views/StatusView.vue'),
    meta: { public: true, status: 500 },
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('../views/StatusView.vue'),
    meta: { public: true, status: 404 },
  },
]
export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
const removers: (() => void)[] = []
export function installSessionRouting(pinia: Pinia) {
  const session = useSessionStore(pinia)
  bindSessionRoutes((menus: MenuResource[]) => {
    removers.splice(0).forEach((remove) => remove())
    for (const menu of flattenMenus(menus)) {
      const component = COMPONENTS[menu.component!]
      if (component)
        removers.push(
          router.addRoute('Layout', {
            path: menu.path!,
            name: menu.routeName!,
            component,
            meta: { title: menu.name, permission: menu.permission, resourceId: menu.id },
          }),
        )
    }
  })
  router.beforeEach(async (to) => {
    if (session.user?.firstPasswordChangeRequired && to.name !== 'Password') return '/password'
    if (['Forbidden', 'NotFound', 'Error'].includes(String(to.name))) return true
    if (to.meta.status === 404 && !Object.values(COMPONENT_PATHS).includes(to.path)) return true
    try {
      await session.restore()
    } catch {
      return to.name === 'Login' ? true : '/error'
    }
    if (!session.user) {
      if (to.name === 'Login') return true
      return {
        name: 'Login',
        query: { returnTo: safeReturnPath(to.path, Object.values(COMPONENT_PATHS)) },
      }
    }
    if (session.user.firstPasswordChangeRequired) return to.name === 'Password' ? true : '/password'
    if (to.name === 'Password') return true
    if (to.name === 'Login' || to.path === '/') return session.paths[0] || '/403'
    if (Object.values(COMPONENT_PATHS).includes(to.path) && !session.paths.includes(to.path))
      return '/403'
    // Refresh initially resolves against the static matcher; resolve again after authorized routes install.
    if (!to.meta.resourceId && session.paths.includes(to.path))
      return { path: to.fullPath, replace: true }
    return true
  })
  router.afterEach((to) => {
    if (to.meta.resourceId) session.visitTab(to.path, String(to.meta.title || '页面'))
  })
}
