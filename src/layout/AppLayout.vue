<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Expand, Fold, ArrowDown, Lock, SwitchButton, HomeFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import BrandMark from '../components/BrandMark.vue'
import MenuNode from '../components/MenuNode.vue'
import { visibleMenus } from '../router/menu'
import { useSessionStore } from '../stores/session'
import { usePreferencesStore } from '../stores/preferences'
import { errorMessage } from '../api/http'
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const preferences = usePreferencesStore()
const leaving = ref(false)
const navMenus = computed(() => visibleMenus(session.menus))
async function userAction(command: string) {
  if (command === 'password') {
    await router.push('/password')
    return
  }
  if (leaving.value) return
  leaving.value = true
  try {
    await session.logout()
    await router.replace('/login')
  } catch (error) {
    ElMessage.error(errorMessage(error))
    if (!session.user) await router.replace('/login')
  } finally {
    leaving.value = false
  }
}
function closeTab(path: string) {
  session.closeTab(path)
  if (route.path === path) void router.push(session.tabs.at(-1)?.path || session.paths[0] || '/403')
}
</script>
<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': preferences.collapsed }">
    <aside class="sidebar">
      <BrandMark :compact="preferences.collapsed" light />
      <div v-if="!preferences.collapsed" class="sidebar-label">工作空间</div>
      <el-menu
        class="side-menu"
        :default-active="route.path"
        :collapse="preferences.collapsed"
        :collapse-transition="false"
        router
      >
        <MenuNode v-for="menu in navMenus" :key="menu.id" :node="menu" />
      </el-menu>
      <div class="sidebar-bottom">
        <span class="live-dot"></span
        ><span v-if="!preferences.collapsed">平台基础工程 <small>V1.0</small></span>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="icon-button"
            :aria-label="preferences.collapsed ? '展开菜单' : '折叠菜单'"
            @click="preferences.collapsed = !preferences.collapsed"
          >
            <el-icon :size="20"><Expand v-if="preferences.collapsed" /><Fold v-else /></el-icon>
          </button>
          <el-breadcrumb separator="/"
            ><el-breadcrumb-item :to="session.paths[0] || '/'"
              ><el-icon><HomeFilled /></el-icon
              ><span class="breadcrumb-home">工作台</span></el-breadcrumb-item
            ><el-breadcrumb-item>{{
              route.meta.title || '首页'
            }}</el-breadcrumb-item></el-breadcrumb
          >
        </div>
        <div class="topbar-right">
          <span class="workspace-label">基础框架</span>
          <div class="topbar-divider"></div>
          <el-dropdown trigger="click" @command="userAction"
            ><button class="user-button" :disabled="leaving">
              <span class="user-avatar">{{ session.user?.displayName.slice(0, 1) || '用' }}</span
              ><span class="user-name">{{ session.user?.displayName }}</span
              ><el-icon><ArrowDown /></el-icon></button
            ><template #dropdown
              ><el-dropdown-menu
                ><el-dropdown-item command="password" :icon="Lock">修改密码</el-dropdown-item
                ><el-dropdown-item command="logout" :icon="SwitchButton" divided
                  >退出登录</el-dropdown-item
                ></el-dropdown-menu
              ></template
            ></el-dropdown
          >
        </div>
      </header>
      <nav v-if="preferences.config.tabsEnabled" class="page-tabs" aria-label="已打开页面">
        <button
          v-for="tab in session.tabs"
          :key="tab.path"
          class="page-tab"
          :class="{ active: route.path === tab.path }"
          @click="router.push(tab.path)"
        >
          <span class="tab-dot"></span>{{ tab.title
          }}<span
            v-if="session.tabs.length > 1"
            class="tab-close"
            role="button"
            tabindex="0"
            aria-label="关闭页签"
            @click.stop="closeTab(tab.path)"
            @keydown.enter.stop="closeTab(tab.path)"
            >×</span
          >
        </button>
      </nav>
      <main class="content"><router-view /></main>
      <footer class="workspace-footer">
        <span>{{ preferences.config.systemName }}</span
        ><span>基础框架 · 安全会话 · 授权访问</span>
      </footer>
    </div>
  </div>
</template>
