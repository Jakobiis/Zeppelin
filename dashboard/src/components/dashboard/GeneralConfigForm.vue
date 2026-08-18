<template>
  <div class="bg-card border border-border rounded-lg shadow-md p-6">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">General</h2>

    <div v-if="visibleKeys.length" class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-4 items-start">
      <PluginConfigField
        v-for="key in visibleKeys"
        :key="key"
        :class="isWide(schema.properties[key], key) ? 'col-span-full' : ''"
        :schema="schema.properties[key]"
        :field-key="key"
        :label="prettifyKey(key)"
        :model-value="modelValue[key]"
        @update:model-value="(val) => updateKey(key, val)"
      />
    </div>
    <p v-else class="text-sm text-muted-foreground italic">Nothing configurable here yet.</p>

    <select
      v-if="hiddenKeys.length"
      class="btn-add select-arrow"
      :class="visibleKeys.length ? 'mt-3' : 'mt-2'"
      value=""
      @change="addField(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
    >
      <option value="" disabled>+ Add field…</option>
      <option v-for="key in hiddenKeys" :key="key" :value="key">{{ prettifyKey(key) }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import PluginConfigField from "./PluginConfigField.vue";
import { defaultForSchema, isWide, prettifyKey, useOrderedObjectFieldKeys } from "./pluginConfigSchema";

const props = defineProps<{
  // Already-fetched JSON Schema for the guild config's top-level, non-plugin fields (prefix, embed_color,
  // levels) — see backend's generalConfigSchema.ts.
  schema: any;
  modelValue: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: Record<string, any>): void;
}>();

// Same "only show what's required or already set" treatment plugin config forms get — with everything here
// being optional, a fresh guild starts with just the "+ Add field" picker instead of three near-empty rows.
const { visible: visibleKeys, hidden: hiddenKeys } = useOrderedObjectFieldKeys(
  computed(() => props.schema),
  computed(() => props.modelValue),
);

function updateKey(key: string, value: any) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}

function addField(key: string) {
  if (!key) return;
  updateKey(key, defaultForSchema(props.schema?.properties?.[key]));
}
</script>
