<script setup lang="ts">
import { onMounted } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { usePreferencesStore } from './stores/preferences'
const preferences = usePreferencesStore()
onMounted(() => {
  void preferences.loadConfig()
})
</script>
<template>
  <ElConfigProvider :locale="zhCn"><router-view /></ElConfigProvider>
</template>
