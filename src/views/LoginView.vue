<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { User, Lock, ArrowRight, CircleCheck } from '@element-plus/icons-vue'
import BrandMark from '../components/BrandMark.vue'
import { useSessionStore } from '../stores/session'
import { errorMessage } from '../api/http'
import { safeReturnPath } from '../utils/permissions'
const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const form = reactive({ username: '', password: '' })
const submitting = ref(false)
const error = ref('')
async function submit() {
  if (submitting.value) return
  error.value = ''
  if (!form.username.trim() || !form.password) {
    error.value = '请输入账号和密码'
    return
  }
  submitting.value = true
  try {
    await session.login(form.username.trim(), form.password)
    await router.replace(
      session.user?.firstPasswordChangeRequired
        ? '/password'
        : safeReturnPath(route.query.returnTo, session.paths, session.paths[0] || '/403'),
    )
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    submitting.value = false
    form.password = ''
  }
}
</script>
<template>
  <div class="auth-page">
    <section class="auth-visual">
      <BrandMark light />
      <div class="auth-intro">
        <span class="eyebrow">A SOLID FOUNDATION</span>
        <h1>从可靠的基础，<br />开启智能采购。</h1>
        <p>统一身份，明确权限。<br />让每一次访问都有边界，让后续业务从容生长。</p>
        <div class="auth-pill">
          <el-icon><CircleCheck /></el-icon> 独立架构 · 安全会话 · 授权菜单
        </div>
      </div>
      <div class="foundation-illustration" aria-hidden="true">
        <div class="illustration-top"><span></span><span></span><span></span><i></i></div>
        <div class="illustration-body">
          <div class="illustration-sidebar"><b></b><b></b><b></b><b></b></div>
          <div class="illustration-content">
            <div class="illustration-heading"></div>
            <div class="illustration-cards"><i></i><i></i><i></i></div>
            <div class="illustration-lines"><b></b><b></b><b></b></div>
          </div>
        </div>
        <span class="illustration-check"
          ><el-icon><Lock /></el-icon
        ></span>
      </div>
      <div class="auth-visual-footer"><span>PLATFORM BASE</span><span>基础框架 V1.0</span></div>
    </section>
    <section class="auth-form-panel">
      <div class="auth-mobile-brand"><BrandMark /></div>
      <div class="login-form-wrap">
        <div class="section-kicker"><span></span> 授权访问</div>
        <h2>欢迎登录</h2>
        <p class="auth-description">使用已开通的账户进入平台工作空间</p>
        <form @submit.prevent="submit">
          <label class="field-label" for="username">账号</label
          ><el-input
            id="username"
            v-model="form.username"
            :prefix-icon="User"
            placeholder="请输入登录账号"
            autocomplete="username"
            maxlength="128"
            size="large"
            :disabled="submitting"
          />
          <label class="field-label" for="password">密码</label
          ><el-input
            id="password"
            v-model="form.password"
            :prefix-icon="Lock"
            type="password"
            placeholder="请输入登录密码"
            autocomplete="current-password"
            maxlength="256"
            show-password
            size="large"
            :disabled="submitting"
          />
          <div class="login-help">
            <el-icon><Lock /></el-icon><span>会话由安全 Cookie 管理</span>
          </div>
          <el-alert
            v-if="error || session.connectionError"
            class="form-error"
            :title="error || session.connectionError"
            type="error"
            :closable="false"
            show-icon
          />
          <el-button
            class="submit-button"
            type="primary"
            native-type="submit"
            size="large"
            :loading="submitting"
            >{{ submitting ? '正在验证身份' : '登录工作空间'
            }}<el-icon v-if="!submitting"><ArrowRight /></el-icon
          ></el-button>
        </form>
        <div class="login-notice">
          首次使用初始化账户时，需要先修改初始密码。<br />如需账户帮助，请联系平台管理人员。
        </div>
      </div>
      <div class="auth-form-footer">
        <el-icon><Lock /></el-icon> 仅限已授权账户使用 · 登录操作将记录安全审计
      </div>
    </section>
  </div>
</template>
