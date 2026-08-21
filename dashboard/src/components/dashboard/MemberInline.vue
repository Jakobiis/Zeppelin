<template>
  <div class="min-w-0 flex items-center gap-2">
    <img v-if="avatar" :src="avatar" :alt="displayName" class="rounded-full shrink-0 object-cover" :style="avatarStyle" />
    <div v-else class="rounded-full shrink-0 flex items-center justify-center bg-muted text-muted-foreground font-medium uppercase" :style="avatarStyle">
      {{ initial }}
    </div>
    <div class="min-w-0">
      <div class="truncate">{{ displayName }}</div>
      <div class="text-xs text-muted-foreground font-mono truncate">({{ id }})</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    avatar: string | null;
    displayName: string;
    id: string;
    size?: number;
  }>(),
  { size: 24 },
);

const avatarStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${props.size * 0.45}px`,
}));

const initial = computed(() => props.displayName?.trim()?.[0]?.toUpperCase() ?? "?");
</script>
