<script setup lang="ts">
import { usePreferencesStore } from '../stores/preferences'
defineProps<{ compact?: boolean; light?: boolean }>()
const preferences = usePreferencesStore()
</script>
<template>
  <div class="brand" :class="{ 'brand-light': light }">
    <img :src="preferences.config.logoPath || '/mark.svg'" alt="平台标志" width="40" height="40" />
    <div v-if="!compact" class="brand-copy">
      <strong>{{ preferences.config.systemName }}</strong
      ><span>PLATFORM BASE</span>
    </div>
  </div>
</template>
