<template>
  <div class="bg-card border border-border rounded-lg shadow-md p-6">
    <div v-if="pluginTitle" class="mb-4 pb-4 border-b border-border">
      <h1 class="text-lg font-semibold">{{ pluginTitle }}</h1>
      <div v-if="pluginDescription" class="main-content text-sm text-muted-foreground mt-1">
        <MarkdownBlock :content="pluginDescription" />
      </div>
    </div>

    <div v-if="searchedVisibleConfigKeys.length" class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-4 items-start">
      <PluginConfigField
        v-for="key in searchedVisibleConfigKeys"
        :key="key"
        :class="isWide(configSchema.properties[key], key) ? 'col-span-full' : ''"
        :schema="configSchema.properties[key]"
        :field-key="key"
        :label="prettifyKey(key)"
        :model-value="modelValue.config[key]"
        @update:model-value="(val) => updateConfigKey(key, val)"
      />
    </div>
    <p v-else-if="searchQuery" class="text-sm text-muted-foreground italic">No fields match "{{ searchQuery }}".</p>
    <p v-else class="text-sm text-muted-foreground italic">Nothing configurable here yet.</p>

    <ComboboxField
      v-if="hiddenConfigKeys.length"
      class="max-w-xs"
      :class="visibleConfigKeys.length ? 'mt-3' : 'mt-2'"
      input-class="btn-add"
      reset-on-select
      placeholder="+ Add field…"
      :options="hiddenConfigFieldOptions"
      :model-value="null"
      @update:model-value="(key) => addConfigField(String(key))"
    />

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
import { computed, inject, provide, type ComputedRef } from "vue";
import MarkdownBlock from "../docs/MarkdownBlock.vue";
import ComboboxField from "./ComboboxField.vue";
import PluginConfigField from "./PluginConfigField.vue";
import { defaultForSchema, isWide, prettifyKey, schemaValueMatchesSearch, useOrderedObjectFieldKeys } from "./pluginConfigSchema";

const props = defineProps<{
  guildId: string;
  // Already-dereferenced { properties: { config, overrides } } schema for this plugin.
  schema: any;
  modelValue: { config: Record<string, any>; overrides: any[] };
  // Plugin name + docs description (from the same registry the docs pages use), shown at the top of the card so
  // the Interface tab doesn't require flipping to the docs page just to know what a plugin does.
  pluginTitle?: string | null;
  pluginDescription?: string | null;
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

// Interface-wide search (see GuildConfigEditor's provide()) — further narrows the already-visible top-level
// fields down to ones matching by name or by something inside them, so e.g. searching "ttt" surfaces the
// "Games" field even though the match is a specific game buried inside its record.
const searchQuery = inject<ComputedRef<string>>("pluginConfigSearchQuery", computed(() => ""));
const searchedVisibleConfigKeys = computed(() => {
  const q = searchQuery.value.trim();
  if (!q) return visibleConfigKeys.value;
  return visibleConfigKeys.value.filter(
    (key) =>
      prettifyKey(key).toLowerCase().includes(q.toLowerCase()) ||
      schemaValueMatchesSearch(configSchema.value?.properties?.[key], props.modelValue.config[key], q),
  );
});

function updateConfigKey(key: string, value: any) {
  emit("update:modelValue", { ...props.modelValue, config: { ...props.modelValue.config, [key]: value } });
}

function addConfigField(key: string) {
  if (!key) return;
  updateConfigKey(key, defaultForSchema(configSchema.value?.properties?.[key]));
}

const hiddenConfigFieldOptions = computed(() => hiddenConfigKeys.value.map((key) => ({ value: key, label: prettifyKey(key) })));
</script>
