<template>
  <li :class="{active: active}">
    <slot></slot>
  </li>
</template>

<style scoped>
  @reference "../style/app.css";

  li {
    @apply relative -mb-px;
  }

  li.active::after {
    content: "";
    @apply absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-primary;
  }

  :deep(a) {
    @apply block;
    @apply py-2;
    @apply px-4;
    @apply text-sm font-medium;
    @apply text-muted-foreground;
    @apply rounded-t-md;
    @apply transition-colors duration-150;

    &:hover {
      @apply text-foreground bg-accent/40;
    }
  }

  .active :deep(a) {
    @apply text-foreground;
  }
</style>

<script lang="ts">
  export default {
    props: ["active"],
  };
</script>
