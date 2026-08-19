<template>
  <li :class="[variant === 'header' ? 'header' : 'pill', {active: active}]">
    <slot></slot>
  </li>
</template>

<style scoped>
  @reference "../style/app.css";

  li {
    @apply relative -mb-px;
  }

  /* Default ("pill") variant — a small rounded button-like tab with a colored active underline. */
  li.pill.active::after {
    content: "";
    @apply absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-primary;
  }

  li.pill :deep(a) {
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

  li.pill.active :deep(a) {
    @apply text-foreground;
  }

  /* "header" variant — reads as a page section header you happen to be able to click, not a colorful pill
     button: bigger, bolder text and a plain neutral active underline (not the primary blue), no hover fill. */
  li.header.active::after {
    content: "";
    @apply absolute left-0 right-0 -bottom-px h-0.5 bg-foreground;
  }

  li.header :deep(a) {
    @apply block;
    @apply py-2;
    @apply text-base font-semibold;
    @apply tracking-tight;
    @apply text-muted-foreground;
    @apply transition-colors duration-150;

    &:hover {
      @apply text-foreground;
    }
  }

  li.header.active :deep(a) {
    @apply text-foreground;
  }
</style>

<script lang="ts">
  export default {
    props: ["active", "variant"],
  };
</script>
