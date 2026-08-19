<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" @click.self="$emit('cancel')">
    <div class="bg-card border border-border rounded-lg shadow-lg max-w-sm w-full p-5">
      <h3 class="font-semibold mb-2">{{ title }}</h3>
      <p class="text-sm text-muted-foreground whitespace-pre-line">{{ message }}</p>

      <div v-if="showNumberInput" class="mt-4">
        <label class="text-sm font-medium">{{ numberLabel }}</label>
        <input
          type="number"
          min="1"
          class="field-input mt-1"
          :value="numberValue"
          @input="numberValue = ($event.target as HTMLInputElement).valueAsNumber || 1"
        />
      </div>

      <div class="flex justify-end gap-2 mt-5">
        <button type="button" class="btn-secondary" @click="$emit('cancel')">Cancel</button>
        <button type="button" class="btn-primary" @click="onConfirm">{{ confirmLabel || "Confirm" }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  showNumberInput?: boolean;
  numberLabel?: string;
  numberDefault?: number;
}>();

const emit = defineEmits<{
  (e: "confirm", value: number | undefined): void;
  (e: "cancel"): void;
}>();

const numberValue = ref(props.numberDefault ?? 1);

// Reset to the default every time the modal opens, so a leftover value from a previous confirmation
// (e.g. a different giveaway's reroll count) doesn't carry over.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) numberValue.value = props.numberDefault ?? 1;
  },
);

function onConfirm() {
  emit("confirm", props.showNumberInput ? numberValue.value : undefined);
}
</script>
