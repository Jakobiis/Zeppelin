<template>
  <div v-if="pluginTitle" class="mb-4">
    <h1 class="text-lg font-semibold">{{ pluginTitle }}</h1>
    <div v-if="pluginDescription" class="main-content text-sm text-muted-foreground mt-1">
      <MarkdownBlock :content="pluginDescription" />
    </div>
  </div>

  <div class="flex flex-col gap-4">
    <!-- Each "wide" field (records/arrays/objects/unions/special pickers — anything that needs real room, same
         cutoff PluginConfigField itself uses for its own nested fields) gets its own card instead of sharing one
         big card with everything else, so e.g. a plugin's whole "counters" list reads as its own distinct unit
         rather than being crammed in next to unrelated toggles. -->
    <div
      v-for="key in wideVisibleKeys"
      :key="key"
      class="bg-card border border-border rounded-3xl shadow-md p-4 sm:p-6"
    >
      <PluginConfigField
        :schema="configSchema.properties[key]"
        :field-key="key"
        :label="prettifyKey(key)"
        :model-value="modelValue.config[key]"
        @update:model-value="(val) => updateConfigKey(key, val)"
      />
    </div>

    <!-- Everything simple (booleans, plain strings/numbers, color pickers) shares one compact card — these are
         the "3 toggles" a plugin like Counters has alongside its counters list, and packing them together reads
         far better than each getting its own mostly-empty card. Split further into a toggle row and a value grid
         (see below) rather than mixing both kinds in the same grid cells. -->
    <div v-if="packedVisibleKeys.length" class="bg-card border border-border rounded-3xl shadow-md p-4 sm:p-6">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">General</h2>

      <!-- Toggles: a wrapped row, not the value grid below — a boolean field only ever renders its header row
           (checkbox + label, no input underneath), so forcing it into a 220px grid column meant for a
           label-then-input stack stretched every switch to that column's width and left dead space beneath it.
           Wrapping at natural width instead lets several toggles sit shoulder-to-shoulder on one line. -->
      <div v-if="packedToggleKeys.length" class="flex flex-wrap gap-x-6 gap-y-3 pt-4 border-t border-border">
        <PluginConfigField
          v-for="key in packedToggleKeys"
          :key="key"
          :schema="configSchema.properties[key]"
          :field-key="key"
          :label="prettifyKey(key)"
          :model-value="modelValue.config[key]"
          @update:model-value="(val) => updateConfigKey(key, val)"
        />
      </div>

      <div
        v-if="packedValueKeys.length"
        class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-4 items-start"
        :class="packedToggleKeys.length ? 'mt-4 pt-4 border-t border-border' : ''"
      >
        <PluginConfigField
          v-for="key in packedValueKeys"
          :key="key"
          :schema="configSchema.properties[key]"
          :field-key="key"
          :label="prettifyKey(key)"
          :model-value="modelValue.config[key]"
          @update:model-value="(val) => updateConfigKey(key, val)"
        />
      </div>
    </div>

    <p v-if="!searchedVisibleConfigKeys.length && searchQuery" class="text-sm text-muted-foreground italic">
      No fields match "{{ searchQuery }}".
    </p>
    <p v-else-if="!searchedVisibleConfigKeys.length && !hiddenConfigKeys.length" class="text-sm text-muted-foreground italic">
      Nothing configurable here yet.
    </p>

    <ComboboxField
      v-if="hiddenConfigKeys.length"
      class="max-w-xs"
      input-class="btn-add"
      reset-on-select
      placeholder="+ Add field…"
      :options="hiddenConfigFieldOptions"
      :model-value="null"
      @update:model-value="(key) => addConfigField(String(key))"
    />

    <div v-if="overridesSchema" class="bg-card border border-border rounded-3xl shadow-md p-4 sm:p-6">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Overrides</h2>
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
import {
  classifyKind,
  defaultForSchema,
  isWide,
  prettifyKey,
  schemaValueMatchesSearch,
  unwrapNullable,
  useOrderedObjectFieldKeys,
} from "./pluginConfigSchema";

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

// Same wide/packed split PluginConfigField uses to decide whether one of ITS nested fields needs the full grid
// row — reused here to decide whether a top-level field gets its own card (records/arrays/objects/unions/special
// pickers) or shares the compact "General"-style card with the other simple fields (booleans/strings/numbers).
const wideVisibleKeys = computed(() => searchedVisibleConfigKeys.value.filter((key) => isWide(configSchema.value?.properties?.[key], key)));
const packedVisibleKeys = computed(() => searchedVisibleConfigKeys.value.filter((key) => !isWide(configSchema.value?.properties?.[key], key)));

// Splits the packed fields further — a boolean only ever renders a header row (checkbox + label, no input below
// it), so it gets a compact wrapped row of its own instead of sharing the value grid, where it'd be stretched to
// a 220px column and leave the space below it empty. See the template comment above the toggle row.
function isBooleanKey(key: string): boolean {
  return classifyKind(unwrapNullable(configSchema.value?.properties?.[key]).inner) === "boolean";
}
const packedToggleKeys = computed(() => packedVisibleKeys.value.filter(isBooleanKey));
const packedValueKeys = computed(() => packedVisibleKeys.value.filter((key) => !isBooleanKey(key)));

function updateConfigKey(key: string, value: any) {
  emit("update:modelValue", { ...props.modelValue, config: { ...props.modelValue.config, [key]: value } });
}

function addConfigField(key: string) {
  if (!key) return;
  updateConfigKey(key, defaultForSchema(configSchema.value?.properties?.[key]));
}

const hiddenConfigFieldOptions = computed(() => hiddenConfigKeys.value.map((key) => ({ value: key, label: prettifyKey(key) })));
</script>
