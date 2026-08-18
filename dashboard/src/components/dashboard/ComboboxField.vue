<template>
  <div class="relative" ref="rootEl">
    <input
      type="text"
      class="field-input"
      :class="inputClass"
      :placeholder="placeholder"
      :value="inputValue"
      @focus="onFocus"
      @input="onInput(($event.target as HTMLInputElement).value)"
      @keydown="onKeydown"
    />
    <div
      v-if="open && filteredOptions.length"
      class="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto border border-border rounded-lg bg-popover shadow-lg py-1"
    >
      <button
        v-for="(opt, i) in filteredOptions"
        :key="opt.value"
        type="button"
        class="block w-full text-left px-3 py-1.5 text-sm truncate cursor-pointer"
        :class="i === highlightedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'"
        @mousedown.prevent="choose(opt)"
        @mouseenter="highlightedIndex = i"
      >
        {{ opt.label }}
      </button>
    </div>
    <div
      v-else-if="open && query"
      class="absolute z-20 left-0 right-0 mt-1 border border-border rounded-lg bg-popover shadow-lg px-3 py-2 text-sm text-muted-foreground"
    >
      No matches.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

export interface ComboboxOption {
  value: string | number;
  label: string;
}

const props = defineProps<{
  modelValue: string | number | null;
  options: ComboboxOption[];
  placeholder?: string;
  // Extra classes for the text input, layered on top of .field-input (e.g. "btn-add" for a dashed "+ Add" look).
  inputClass?: string;
  // When true, the input never shows a "currently selected" label — it's always empty/placeholder outside of
  // active typing. Used for fire-and-reset pickers like "+ Add field", where choosing an option performs an
  // action rather than maintaining a persistent selection.
  resetOnSelect?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string | number | null): void;
}>();

const rootEl = ref<HTMLElement | null>(null);
const open = ref(false);
const query = ref("");
const highlightedIndex = ref(0);

const selectedLabel = computed(() => props.options.find((o) => o.value === props.modelValue)?.label ?? "");

// What the input actually displays: the live search query while open, otherwise the current selection's label
// (or nothing at all, for resetOnSelect pickers).
const inputValue = computed(() => (open.value ? query.value : props.resetOnSelect ? "" : selectedLabel.value));

// Capped for perf — servers can have hundreds of channels/roles, and there's no need to render/filter more than
// a screenful's worth of matches at once.
const MAX_RESULTS = 200;
const filteredOptions = computed(() => {
  const q = query.value.trim().toLowerCase();
  const matches = q ? props.options.filter((o) => o.label.toLowerCase().includes(q)) : props.options;
  return matches.slice(0, MAX_RESULTS);
});

function onFocus() {
  open.value = true;
  query.value = props.resetOnSelect ? "" : selectedLabel.value;
  highlightedIndex.value = 0;
}

function onInput(text: string) {
  query.value = text;
  open.value = true;
  highlightedIndex.value = 0;
}

function choose(opt: ComboboxOption) {
  emit("update:modelValue", opt.value);
  query.value = "";
  open.value = false;
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    open.value = true;
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, filteredOptions.value.length - 1);
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    const opt = filteredOptions.value[highlightedIndex.value];
    if (opt) choose(opt);
  } else if (ev.key === "Escape") {
    open.value = false;
    (ev.target as HTMLElement).blur();
  }
}

function onDocumentMouseDown(ev: MouseEvent) {
  if (open.value && rootEl.value && !rootEl.value.contains(ev.target as Node)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener("mousedown", onDocumentMouseDown));
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocumentMouseDown));
</script>
