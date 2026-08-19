<template>
  <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">General</h2>

  <div class="flex flex-col gap-4">
    <!-- Same wide/packed card split as a plugin's own Interface form (see PluginConfigForm.vue) — a record like
         "levels" gets its own card instead of being crammed in next to the plain prefix/embed_color fields. -->
    <div
      v-for="key in wideVisibleKeys"
      :key="key"
      class="bg-card border border-border rounded-lg shadow-md p-4 sm:p-6"
    >
      <PluginConfigField
        :schema="schema.properties[key]"
        :field-key="key"
        :label="prettifyKey(key)"
        :model-value="modelValue[key]"
        @update:model-value="(val) => updateKey(key, val)"
      />
    </div>

    <div v-if="packedVisibleKeys.length" class="bg-card border border-border rounded-lg shadow-md p-4 sm:p-6">
      <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-4 items-start">
        <PluginConfigField
          v-for="key in packedVisibleKeys"
          :key="key"
          :schema="schema.properties[key]"
          :field-key="key"
          :label="prettifyKey(key)"
          :model-value="modelValue[key]"
          @update:model-value="(val) => updateKey(key, val)"
        />
      </div>
    </div>

    <p v-if="!searchedVisibleKeys.length && searchQuery" class="text-sm text-muted-foreground italic">
      No fields match "{{ searchQuery }}".
    </p>
    <p v-else-if="!searchedVisibleKeys.length && !hiddenKeys.length" class="text-sm text-muted-foreground italic">
      Nothing configurable here yet.
    </p>

    <ComboboxField
      v-if="hiddenKeys.length"
      class="max-w-xs"
      input-class="btn-add"
      reset-on-select
      placeholder="+ Add field…"
      :options="hiddenFieldOptions"
      :model-value="null"
      @update:model-value="(key) => addField(String(key))"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, type ComputedRef } from "vue";
import ComboboxField from "./ComboboxField.vue";
import PluginConfigField from "./PluginConfigField.vue";
import { defaultForSchema, isWide, prettifyKey, schemaValueMatchesSearch, useOrderedObjectFieldKeys } from "./pluginConfigSchema";

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

const searchQuery = inject<ComputedRef<string>>("pluginConfigSearchQuery", computed(() => ""));
const searchedVisibleKeys = computed(() => {
  const q = searchQuery.value.trim();
  if (!q) return visibleKeys.value;
  return visibleKeys.value.filter(
    (key) =>
      prettifyKey(key).toLowerCase().includes(q.toLowerCase()) ||
      schemaValueMatchesSearch(props.schema?.properties?.[key], props.modelValue[key], q),
  );
});

// Same wide/packed split as PluginConfigForm — a field needing real room (e.g. the "levels" record) gets its own
// card, while plain fields (prefix, embed_color) share one compact card.
const wideVisibleKeys = computed(() => searchedVisibleKeys.value.filter((key) => isWide(props.schema?.properties?.[key], key)));
const packedVisibleKeys = computed(() => searchedVisibleKeys.value.filter((key) => !isWide(props.schema?.properties?.[key], key)));

function updateKey(key: string, value: any) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}

function addField(key: string) {
  if (!key) return;
  updateKey(key, defaultForSchema(props.schema?.properties?.[key]));
}

const hiddenFieldOptions = computed(() => hiddenKeys.value.map((key) => ({ value: key, label: prettifyKey(key) })));
</script>
