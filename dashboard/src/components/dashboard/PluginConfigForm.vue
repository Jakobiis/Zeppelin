<template>
  <div class="bg-card border border-border rounded-lg shadow-md p-6">
    <div v-if="visibleConfigKeys.length" class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-4 items-start">
      <PluginConfigField
        v-for="key in visibleConfigKeys"
        :key="key"
        :class="isWide(configSchema.properties[key], key) ? 'col-span-full' : ''"
        :schema="configSchema.properties[key]"
        :field-key="key"
        :label="prettifyKey(key)"
        :model-value="modelValue.config[key]"
        @update:model-value="(val) => updateConfigKey(key, val)"
      />
    </div>
    <p v-else class="text-sm text-muted-foreground italic">Nothing configurable here yet.</p>

    <select
      v-if="hiddenConfigKeys.length"
      class="btn-add select-arrow"
      :class="visibleConfigKeys.length ? 'mt-3' : 'mt-2'"
      value=""
      @change="addConfigField(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
    >
      <option value="" disabled>+ Add field…</option>
      <option v-for="key in hiddenConfigKeys" :key="key" :value="key">{{ prettifyKey(key) }}</option>
    </select>

    <div v-if="overridesSchema" class="border-t border-border pt-5 mt-6">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Overrides</h2>
      <PluginConfigField
        :schema="overridesSchema"
        field-key="overrides"
        no-header
        :model-value="modelValue.overrides"
        @update:model-value="(val) => $emit('update:modelValue', { ...modelValue, overrides: val })"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, provide } from "vue";
import PluginConfigField from "./PluginConfigField.vue";
import { defaultForSchema, isWide, prettifyKey, useOrderedObjectFieldKeys } from "./pluginConfigSchema";

const props = defineProps<{
  guildId: string;
  // Already-dereferenced { properties: { config, overrides } } schema for this plugin.
  schema: any;
  modelValue: { config: Record<string, any>; overrides: any[] };
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: { config: Record<string, any>; overrides: any[] }): void;
}>();

provide("pluginConfigGuildId", props.guildId);

const configSchema = computed(() => props.schema?.properties?.config ?? null);
const overridesSchema = computed(() => props.schema?.properties?.overrides ?? null);

// Same "only show what's required or already set" treatment as nested objects get inside PluginConfigField —
// applied here too so a plugin's top-level config doesn't list rarely-used optional fields it doesn't need to.
const { visible: visibleConfigKeys, hidden: hiddenConfigKeys } = useOrderedObjectFieldKeys(
  configSchema,
  computed(() => props.modelValue.config),
);

function updateConfigKey(key: string, value: any) {
  emit("update:modelValue", { ...props.modelValue, config: { ...props.modelValue.config, [key]: value } });
}

function addConfigField(key: string) {
  if (!key) return;
  updateConfigKey(key, defaultForSchema(configSchema.value?.properties?.[key]));
}
</script>
