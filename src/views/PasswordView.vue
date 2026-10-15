<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Lock, Check, ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import BrandMark from '../components/BrandMark.vue'
import { useSessionStore } from '../stores/session'
import { errorMessage } from '../api/http'
const session = useSessionStore()
const router = useRouter()
const firstChange = computed(() => session.user?.firstPasswordChangeRequired === true)
const form = reactive({ currentPassword: '', newPassword: '', confirmation: '' })
const submitting = ref(false)
const error = ref('')
async function submit() {
  if (submitting.value) return
  error.value = ''
  if (!form.currentPassword) {
    error.value = '请输入当前密码'
    return
  }
  const length = [...form.newPassword].length
  if (length < 12 || length > 128) {
    error.value = '新密码长度应为 12 至 128 个字符'
    return
  }
  if (form.newPassword !== form.confirmation) {
    error.value = '两次输入的新密码不一致'
    return
  }
  if (form.newPassword === form.currentPassword) {
    error.value = '新密码应与当前密码不同'
    return
  }
  submitting.value = true
  try {
    await session.changePassword(form.currentPassword, form.newPassword)
    ElMessage.success('密码已修改，请使用新密码重新登录')
    await router.replace('/login')
  } catch (cause) {
    error.value = errorMessage(cause)
    if (!session.user) await router.replace('/login')
  } finally {
    submitting.value = false
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmation = ''
  }
}
async function leave() {
  if (!firstChange.value) {
    await router.push('/')
    return
  }
  try {
    await session.logout()
    await router.replace('/login')
  } catch (cause) {
    error.value = errorMessage(cause)
    if (!session.user) await router.replace('/login')
  }
}
</script>
<template>
  <div class="security-page">
    <header>
      <BrandMark /><button class="text-button" :disabled="submitting" @click="leave">
        <el-icon><ArrowLeft /></el-icon>{{ firstChange ? '退出登录' : '返回工作台' }}
      </button>
    </header>
    <main class="security-card">
      <div class="security-emblem">
        <el-icon :size="28"><Lock /></el-icon>
      </div>
      <div class="section-kicker">账户安全</div>
      <h1>{{ firstChange ? '先为账户设置新密码' : '修改登录密码' }}</h1>
      <p>
        {{
          firstChange
            ? '这是首次登录的必要步骤。完成后，请使用新密码重新登录。'
            : '修改成功后，现有会话将失效，需要重新登录。'
        }}
      </p>
      <form @submit.prevent="submit">
        <label class="field-label" for="current-password">当前密码</label
        ><el-input
          id="current-password"
          v-model="form.currentPassword"
          type="password"
          autocomplete="current-password"
          maxlength="256"
          show-password
          size="large"
          :disabled="submitting"
        /><label class="field-label" for="new-password">新密码</label
        ><el-input
          id="new-password"
          v-model="form.newPassword"
          type="password"
          autocomplete="new-password"
          maxlength="256"
          show-password
          size="large"
          :disabled="submitting"
        /><span class="field-help">12 至 128 个字符，支持长密码及 Unicode 字符，保留首尾空格。</span
        ><label class="field-label" for="confirm-password">确认新密码</label
        ><el-input
          id="confirm-password"
          v-model="form.confirmation"
          type="password"
          autocomplete="new-password"
          maxlength="256"
          show-password
          size="large"
          :disabled="submitting"
        /><el-alert
          v-if="error"
          class="form-error"
          :title="error"
          type="error"
          :closable="false"
          show-icon
        /><el-button
          class="submit-button"
          type="primary"
          native-type="submit"
          size="large"
          :loading="submitting"
          ><el-icon v-if="!submitting"><Check /></el-icon>保存新密码</el-button
        >
      </form>
    </main>
    <footer>会话验证与密码修改均由服务端执行</footer>
  </div>
</template>
