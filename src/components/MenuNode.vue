<script setup lang="ts">
import { HomeFilled, FolderOpened } from '@element-plus/icons-vue'
import type { MenuResource } from '../types/api'
defineProps<{ node: MenuResource }>()
</script>
<template>
  <el-sub-menu v-if="node.type === 'DIRECTORY'" :index="`directory-${node.id}`">
    <template #title
      ><el-icon><FolderOpened /></el-icon><span>{{ node.name }}</span></template
    >
    <MenuNode v-for="child in node.children" :key="child.id" :node="child" />
  </el-sub-menu>
  <el-menu-item v-else :index="node.path || ''"
    ><el-icon><HomeFilled /></el-icon><span>{{ node.name }}</span></el-menu-item
  >
</template>
