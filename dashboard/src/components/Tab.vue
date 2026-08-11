<template>
  <li style="padding-bottom: 1px" :class="{active: active}">
    <slot></slot>
  </li>
</template>

<style scoped>
  @reference "../style/app.css";

  li {
    padding-bottom: 1px;

    &.active {
      padding-bottom: 0;
      @apply border-b;
      @apply border-border;
    }
  }

  :deep(a) {
    @apply block;
    @apply py-2;
    @apply px-4;
    @apply text-muted-foreground;

    &:hover {
      @apply text-foreground;
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
