import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  ElAlert,
  ElBreadcrumb,
  ElBreadcrumbItem,
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElIcon,
  ElInput,
  ElMenu,
  ElMenuItem,
  ElSubMenu,
  ElTag,
} from 'element-plus'
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-alert.css'
import 'element-plus/theme-chalk/el-breadcrumb.css'
import 'element-plus/theme-chalk/el-breadcrumb-item.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-dropdown.css'
import 'element-plus/theme-chalk/el-dropdown-item.css'
import 'element-plus/theme-chalk/el-dropdown-menu.css'
import 'element-plus/theme-chalk/el-icon.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-menu.css'
import 'element-plus/theme-chalk/el-menu-item.css'
import 'element-plus/theme-chalk/el-sub-menu.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-tooltip.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import './styles/main.css'
import App from './App.vue'
import { router, installSessionRouting } from './router'
import { useSessionStore } from './stores/session'
import { http } from './api/http'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
installSessionRouting(pinia)
http.onUnauthorized = () => {
  const session = useSessionStore(pinia)
  session.reset()
  if (router.currentRoute.value.name !== 'Login') void router.replace('/login')
}
app.use(router)
for (const component of [
  ElAlert,
  ElBreadcrumb,
  ElBreadcrumbItem,
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElIcon,
  ElInput,
  ElMenu,
  ElMenuItem,
  ElSubMenu,
  ElTag,
])
  app.use(component)
app.mount('#app')
