<template>
  <div class="flex items-center gap-2">
    <input
      type="color"
      class="w-9 h-9 shrink-0 rounded-md border border-border bg-input cursor-pointer p-0.5"
      :value="hexValue"
      @input="onColorInput(($event.target as HTMLInputElement).value)"
    />
    <input
      type="text"
      class="field-input flex-1 font-mono text-sm"
      :placeholder="modelValue == null ? 'Not set' : ''"
      :value="modelValue == null ? '' : hexValue"
      @change="onTextInput(($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue: number | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: number | null): void;
}>();

// The stored value is a plain decimal integer (0-16777215, same as any Discord embed color field) — <input
// type="color"> only speaks #rrggbb hex, so this is the single place that conversion happens.
const hexValue = computed(() => `#${(props.modelValue ?? 0).toString(16).padStart(6, "0")}`);

function onColorInput(hex: string) {
  emit("update:modelValue", parseInt(hex.slice(1), 16));
}

function onTextInput(raw: string) {
  const text = raw.trim();
  if (!text) {
    emit("update:modelValue", null);
    return;
  }
  const n = text.startsWith("#")
    ? parseInt(text.slice(1), 16)
    : text.toLowerCase().startsWith("0x")
      ? parseInt(text.slice(2), 16)
      : Number(text);
  if (Number.isInteger(n) && n >= 0 && n <= 0xffffff) {
    emit("update:modelValue", n);
  }
}
</script>
