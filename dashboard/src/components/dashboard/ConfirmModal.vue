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

      <fieldset v-if="selectionOptions?.length" class="mt-4">
        <legend class="text-sm font-medium">{{ selectionLabel }}</legend>
        <label v-for="option in selectionOptions" :key="option.value" class="mt-2 flex items-center gap-2 text-sm">
          <input v-model="selectedValues" class="checkbox" type="checkbox" :value="option.value" />
          {{ option.label }}
        </label>
      </fieldset>

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
  selectionOptions?: Array<{ value: string; label: string }>;
  selectionLabel?: string;
}>();

const emit = defineEmits<{
  (e: "confirm", value: { amount: number | undefined; selectedValues: string[] }): void;
  (e: "cancel"): void;
}>();

const numberValue = ref(props.numberDefault ?? 1);
const selectedValues = ref<string[]>([]);

// Reset to the default every time the modal opens, so a leftover value from a previous confirmation
// (e.g. a different giveaway's reroll count) doesn't carry over.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      numberValue.value = props.numberDefault ?? 1;
      selectedValues.value = [];
    }
  },
);

function onConfirm() {
  emit("confirm", { amount: props.showNumberInput ? numberValue.value : undefined, selectedValues: selectedValues.value });
}
</script>
