<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { authApi } from '../api/auth'
import type { CaptchaChallenge } from '../types/api'
import { useRoute, useRouter } from 'vue-router'
import { UserFilled, Lock } from '@element-plus/icons-vue'
import { useSessionStore } from '../stores/session'
import { errorMessage } from '../api/http'
import { safeReturnPath } from '../utils/permissions'
import { loginBranding } from '../config/login'

type LoginIdentity = 'SUPPLIER' | 'BUYER'
const identities: { value: LoginIdentity; label: string }[] = [
  { value: 'SUPPLIER', label: '供应商登录' },
  { value: 'BUYER', label: '采购方登录' },
]
const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const identity = ref<LoginIdentity>('BUYER')
const identityLabel = computed(() => (identity.value === 'BUYER' ? '采购方' : '供应商'))
const form = reactive({ username: '', password: '', captchaCode: '' })
const submitting = ref(false)
const error = ref('')
const captcha = ref<CaptchaChallenge | null>(null)
const captchaLoading = ref(false)
const captchaError = ref('')
const captchaExpired = ref(false)
let captchaTimer: ReturnType<typeof setTimeout> | undefined
let captchaRequest: AbortController | undefined
let captchaGeneration = 0
let disposed = false
async function refreshCaptcha() {
  const generation = ++captchaGeneration
  captchaRequest?.abort()
  clearTimeout(captchaTimer)
  captchaRequest = new AbortController()
  captchaLoading.value = true
  captchaExpired.value = false
  captchaError.value = ''
  captcha.value = null
  form.captchaCode = ''
  try {
    const value = await authApi.captcha(captchaRequest.signal)
    if (disposed || generation !== captchaGeneration) return
    if (
      !value ||
      !/^[A-Za-z0-9_-]{32}$/.test(value.captchaId) ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.imageDataUrl) ||
      value.imageDataUrl.length > 100000 ||
      !Number.isInteger(value.expiresInSeconds) ||
      value.expiresInSeconds < 1 ||
      value.expiresInSeconds > 300
    )
      throw new Error('Invalid captcha response')
    captcha.value = value
    captchaTimer = setTimeout(() => {
      captchaExpired.value = true
      form.captchaCode = ''
      captchaError.value = '验证码已过期，请点击图片刷新'
    }, value.expiresInSeconds * 1000)
  } catch (cause) {
    if (!disposed && generation === captchaGeneration) captchaError.value = errorMessage(cause)
  } finally {
    if (!disposed && generation === captchaGeneration) captchaLoading.value = false
  }
}
function manualRefreshCaptcha() {
  error.value = ''
  void refreshCaptcha()
}
onMounted(() => {
  void refreshCaptcha()
})
onBeforeUnmount(() => {
  disposed = true
  captchaGeneration++
  clearTimeout(captchaTimer)
  captchaRequest?.abort()
})

// Only explicitly named, bundled images are used; never execute remote resource configuration.
const images = import.meta.glob<string>('../assets/login/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
})
function findImage(name: string): string | undefined {
  return Object.entries(images).find(([path]) =>
    path.replace(/\.[^.]+$/, '').endsWith(`/${name}`),
  )?.[1]
}
const banner = findImage('company-banner')
const building = findImage('company-building')

function selectIdentity(value: LoginIdentity) {
  if (submitting.value || identity.value === value) return
  identity.value = value
  form.username = ''
  form.password = ''
  form.captchaCode = ''
  error.value = ''
}
function navigateTabs(event: KeyboardEvent) {
  if (submitting.value || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const value =
    event.key === 'Home'
      ? 'SUPPLIER'
      : event.key === 'End'
        ? 'BUYER'
        : identity.value === 'BUYER'
          ? 'SUPPLIER'
          : 'BUYER'
  selectIdentity(value)
  document.getElementById(`login-tab-${value}`)?.focus()
}
async function submit() {
  if (submitting.value) return
  error.value = ''
  if (!form.username.trim() || !form.password) {
    error.value = '请输入账号和密码'
    return
  }
  if (!captcha.value || captchaLoading.value || captchaExpired.value) {
    error.value = '请先刷新验证码'
    return
  }
  if (!/^[0-9]{4}$/.test(form.captchaCode.trim())) {
    error.value = '请输入四位数字验证码'
    return
  }
  submitting.value = true
  let completed = false
  try {
    await session.login(
      form.username.trim(),
      form.password,
      captcha.value.captchaId,
      form.captchaCode.trim(),
    )
    // Portal choice never changes the authenticated identity or server-side grants.
    if (session.user?.identityType !== identity.value) {
      const actual = session.user?.identityType
      try {
        await session.logout()
      } finally {
        session.reset()
      }
      error.value =
        actual === 'BUYER'
          ? '当前账号为采购方账号，请切换到采购方登录'
          : actual === 'SUPPLIER'
            ? '当前账号为供应商账号，请切换到供应商登录'
            : '当前账号身份暂不可用，请联系平台管理人员'
      return
    }
    completed = true
    await router.replace(
      session.user.firstPasswordChangeRequired
        ? '/password'
        : safeReturnPath(route.query.returnTo, session.paths, session.paths[0] || '/403'),
    )
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    form.password = ''
    form.captchaCode = ''
    if (!completed && !disposed) await refreshCaptcha()
    submitting.value = false
  }
}
</script>
<template>
  <div class="corporate-login">
    <header class="corporate-login-header">
      <div class="corporate-login-brand">
        <img
          v-if="banner"
          class="corporate-login-banner"
          :src="banner"
          :alt="`${loginBranding.companyName} · ${loginBranding.platformName}`"
          width="1000"
          height="82"
        />
        <div v-else class="corporate-login-brand-text">
          <strong>{{ loginBranding.companyName }}</strong
          ><span aria-hidden="true"></span><b>{{ loginBranding.platformName }}</b>
        </div>
      </div>
    </header>
    <main class="corporate-login-main">
      <div class="corporate-login-content">
        <div class="corporate-login-photo">
          <img
            v-if="building"
            :src="building"
            :alt="`${loginBranding.companyName}办公楼`"
            width="500"
            height="340"
            fetchpriority="high"
          />
          <p v-else class="corporate-login-photo-pending">办公楼原图待补充</p>
        </div>
        <section class="corporate-login-card" aria-label="用户登录">
          <div class="corporate-login-tabs" role="tablist" aria-label="登录身份">
            <button
              v-for="item in identities"
              :id="`login-tab-${item.value}`"
              :key="item.value"
              type="button"
              role="tab"
              :aria-selected="identity === item.value"
              aria-controls="login-panel"
              :tabindex="identity === item.value ? 0 : -1"
              :class="{ active: identity === item.value }"
              :disabled="submitting"
              @click="selectIdentity(item.value)"
              @keydown="navigateTabs"
            >
              {{ item.label }}
            </button>
          </div>
          <div
            id="login-panel"
            role="tabpanel"
            :aria-labelledby="`login-tab-${identity}`"
            class="corporate-login-panel"
          >
            <form :aria-label="`${identityLabel}登录表单`" @submit.prevent="submit">
              <div class="corporate-login-field">
                <label for="username">用户名</label
                ><el-input
                  id="username"
                  v-model="form.username"
                  :prefix-icon="UserFilled"
                  placeholder="请输入用户名"
                  autocomplete="username"
                  maxlength="128"
                  :disabled="submitting"
                />
              </div>
              <div class="corporate-login-field">
                <label for="password">密　码</label
                ><el-input
                  id="password"
                  v-model="form.password"
                  :prefix-icon="Lock"
                  type="password"
                  placeholder="请输入密码"
                  autocomplete="current-password"
                  maxlength="256"
                  show-password
                  :disabled="submitting"
                />
              </div>
              <div class="corporate-login-field corporate-login-captcha">
                <label for="captcha-code">验证码</label>
                <div class="corporate-login-captcha-controls">
                  <el-input
                    id="captcha-code"
                    v-model="form.captchaCode"
                    inputmode="numeric"
                    autocomplete="off"
                    maxlength="4"
                    aria-label="验证码"
                    :disabled="submitting || captchaLoading || !captcha || captchaExpired"
                  />
                  <button
                    type="button"
                    class="corporate-login-captcha-refresh"
                    aria-label="刷新验证码"
                    title="点击刷新验证码"
                    :disabled="submitting || captchaLoading"
                    @click="manualRefreshCaptcha"
                  >
                    <img
                      v-if="captcha && !captchaExpired"
                      :src="captcha.imageDataUrl"
                      alt="四位数字验证码"
                      width="120"
                      height="40"
                    />
                    <span v-else>{{ captchaLoading ? '加载中' : '点击刷新' }}</span>
                  </button>
                </div>
              </div>
              <div
                v-if="error || session.connectionError || captchaError"
                class="corporate-login-feedback"
                aria-live="polite"
              >
                <p
                  v-if="error || session.connectionError"
                  role="alert"
                  class="corporate-login-error"
                >
                  {{ error || session.connectionError }}
                </p>
                <p v-if="captchaError" role="alert" class="corporate-login-error">
                  {{ captchaError }}
                </p>
              </div>
              <el-button
                class="corporate-login-submit"
                type="primary"
                native-type="submit"
                aria-label="登录"
                :loading="submitting"
                :disabled="captchaLoading || !captcha || captchaExpired"
                >{{ submitting ? '正在登录' : '登 录' }}</el-button
              >
            </form>
          </div>
        </section>
      </div>
    </main>
    <footer class="corporate-login-footer">
      <p>{{ loginBranding.companyName }} | {{ loginBranding.address }}</p>
      <p>技术支持：{{ loginBranding.supportCompany }}</p>
    </footer>
  </div>
</template>
