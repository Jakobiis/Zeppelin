<template>
  <ul :class="['list-none flex border-b border-border mb-4', variant === 'header' ? 'gap-6' : 'gap-1']">
    <slot></slot>
  </ul>
</template>

<script lang="ts">
  export default {
    props: ["variant"],
  };
</script>
