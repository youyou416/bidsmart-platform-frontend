<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, RefreshRight, SwitchButton } from '@element-plus/icons-vue'
import { errorMessage } from '../api/http'
import BrandMark from '../components/BrandMark.vue'
import { useSessionStore } from '../stores/session'
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const leaving = ref(false)
const error = ref('')
const status = computed(() => Number(route.meta.status || 500))
const copy = computed(
  () =>
    ({
      403: {
        title: '暂时无法访问此页面',
        description: '当前账户没有此页面的有效授权，请联系平台管理人员。',
      },
      404: { title: '没有找到这个页面', description: '页面地址可能有误，或此功能尚未开放。' },
      500: { title: '服务暂时不可用', description: '请确认后端服务已启动，再尝试重新连接。' },
    })[status.value] || { title: '页面暂时不可用', description: '请稍后重试。' },
)
async function retry() {
  session.reset(false)
  await router.replace('/')
}
async function logout() {
  if (leaving.value) return
  leaving.value = true
  error.value = ''
  try {
    await session.logout()
    await router.replace('/login')
  } catch (cause) {
    error.value = errorMessage(cause)
    if (!session.user) await router.replace('/login')
  } finally {
    leaving.value = false
  }
}
</script>
<template>
  <div class="status-page">
    <BrandMark />
    <main>
      <div class="status-number">{{ status }}</div>
      <span class="section-kicker">访问状态</span>
      <h1>{{ copy.title }}</h1>
      <p>{{ copy.description }}</p>
      <div class="status-actions">
        <el-button v-if="status === 500" type="primary" :icon="RefreshRight" @click="retry"
          >重新连接</el-button
        ><el-button
          v-else
          type="primary"
          :icon="ArrowLeft"
          @click="router.push(session.user ? '/' : '/login')"
          >{{ session.user ? '返回工作台' : '返回登录' }}</el-button
        >
        <el-button v-if="session.user" :icon="SwitchButton" :loading="leaving" @click="logout"
          >退出登录</el-button
        >
      </div>
      <el-alert
        v-if="error"
        class="form-error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
    </main>
    <footer>平台基础框架 · 授权访问</footer>
  </div>
</template>
