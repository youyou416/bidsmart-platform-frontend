<script setup lang="ts">
import { computed } from 'vue'
import {
  User,
  Lock,
  Menu,
  Connection,
  ArrowRight,
  CircleCheck,
  OfficeBuilding,
  Key,
  InfoFilled,
  Check,
} from '@element-plus/icons-vue'
import { useSessionStore } from '../stores/session'
import { displayIdentity } from '../utils/permissions'
const session = useSessionStore()
const roleNames = computed(
  () => session.user?.roles.map((role) => role.name).join('、') || '未分配角色',
)
const foundations = [
  {
    icon: User,
    title: '统一身份',
    description: '登录、首次改密与会话恢复，建立明确的账户边界。',
    label: '身份认证',
  },
  {
    icon: Key,
    title: '精确授权',
    description: '菜单来自当前授权，角色功能权限由服务端计算。',
    label: '权限基础',
  },
  {
    icon: Lock,
    title: '安全闭环',
    description: '写请求安全校验、会话失效与安全事件审计。',
    label: '安全机制',
  },
  {
    icon: Connection,
    title: '独立架构',
    description: '前端与后端独立构建，为后续模块提供清晰接口。',
    label: '扩展基础',
  },
]
</script>
<template>
  <div class="home-page">
    <div class="page-heading">
      <div>
        <div class="section-kicker">WORKSPACE / 工作空间</div>
        <h1>平台工作台</h1>
        <p>从这里了解基础能力与当前登录身份。</p>
      </div>
      <span class="stage-badge"><span></span> 基础框架阶段</span>
    </div>
    <section class="welcome-card">
      <div class="welcome-copy">
        <span class="welcome-label">欢迎回来</span>
        <h2>{{ session.user?.displayName }}，工作空间已就绪。</h2>
        <p>
          您的身份与授权已从服务端加载。当前工程提供平台基础能力，<br
            class="desktop-break"
          />采购、竞价及审批功能将在后续阶段按业务要求扩展。
        </p>
        <div class="welcome-tags">
          <span
            ><el-icon><CircleCheck /></el-icon> 身份已验证</span
          ><span
            ><el-icon><Menu /></el-icon> 授权菜单已加载</span
          >
        </div>
      </div>
      <div class="welcome-art" aria-hidden="true">
        <div class="art-ring ring-one"></div>
        <div class="art-ring ring-two"></div>
        <div class="art-shield">
          <el-icon :size="58"><Lock /></el-icon>
        </div>
        <div class="art-check">
          <el-icon><Check /></el-icon>
        </div>
      </div>
    </section>
    <div class="home-grid">
      <section class="panel identity-panel">
        <div class="panel-heading">
          <div>
            <span class="panel-symbol"
              ><el-icon><User /></el-icon
            ></span>
            <h2>当前登录身份</h2>
          </div>
          <span class="quiet-label">服务端会话</span>
        </div>
        <div class="identity-summary">
          <span class="large-avatar">{{ session.user?.displayName.slice(0, 1) }}</span>
          <div>
            <strong>{{ session.user?.displayName }}</strong
            ><span>{{ session.user?.username }}</span>
          </div>
          <el-tag effect="plain" type="success">{{
            displayIdentity(session.user?.identityType)
          }}</el-tag>
        </div>
        <dl class="identity-details">
          <div>
            <dt>
              <el-icon><OfficeBuilding /></el-icon>所属部门
            </dt>
            <dd>{{ session.user?.department?.name || '未配置部门' }}</dd>
          </div>
          <div>
            <dt>
              <el-icon><User /></el-icon>关联角色
            </dt>
            <dd>{{ roleNames }}</dd>
          </div>
          <div>
            <dt>
              <el-icon><Key /></el-icon>用户标识
            </dt>
            <dd class="identifier">{{ session.user?.id }}</dd>
          </div>
        </dl>
        <div class="identity-note">
          <el-icon><InfoFilled /></el-icon> 身份信息用于展示，实际访问权限由后端校验。
        </div>
      </section>
      <section class="panel scope-panel">
        <div class="panel-heading">
          <div>
            <span class="panel-symbol"
              ><el-icon><Menu /></el-icon
            ></span>
            <h2>本期交付范围</h2>
          </div>
          <span class="quiet-label">FRAMEWORK</span>
        </div>
        <h3>把基础打牢，再让业务生长。</h3>
        <p>基础工程围绕身份、授权、安全与配置建立闭环，保持独立、清晰、可扩展。</p>
        <div class="scope-tags">
          <span>认证与会话</span><span>动态菜单</span><span>国密工具</span><span>安全审计</span
          ><span>配置与数据源</span>
        </div>
        <div class="scope-footnote">
          <span class="scope-dot"></span><span>采购与竞价业务页面属于后续开发范围</span>
        </div>
      </section>
    </div>
    <section class="foundation-section">
      <div class="section-title">
        <h2>框架基础能力</h2>
        <span>为后续业务模块提供统一约定</span>
      </div>
      <div class="foundation-grid">
        <article v-for="(item, index) in foundations" :key="item.title" class="foundation-card">
          <div class="foundation-card-top">
            <span class="foundation-icon"
              ><el-icon :size="23"><component :is="item.icon" /></el-icon></span
            ><span class="foundation-number">0{{ index + 1 }}</span>
          </div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
          <div class="foundation-card-bottom">
            <span>{{ item.label }}</span
            ><el-icon><ArrowRight /></el-icon>
          </div>
        </article>
      </div>
    </section>
    <section class="authorization-strip">
      <div>
        <el-icon :size="20"><Key /></el-icon><strong>当前有效功能权限</strong>
      </div>
      <div v-if="session.permissions.length" class="permission-tags">
        <el-tag
          v-for="permission in session.permissions"
          :key="permission"
          type="info"
          effect="plain"
          >{{ permission }}</el-tag
        >
      </div>
      <span v-else class="muted">暂无有效功能权限</span>
    </section>
  </div>
</template>
