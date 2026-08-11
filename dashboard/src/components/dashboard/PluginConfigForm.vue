<template>
  <div>
    <div v-if="loading">Loading...</div>
    <div v-else class="bg-card border border-border rounded-lg shadow-md p-6">
      <div v-if="errors.length" class="bg-muted border border-border py-2 px-3 rounded-lg shadow-md mb-4">
        <div class="font-semibold text-destructive">Errors:</div>
        <pre v-for="(error, i) in errors" :key="i" class="text-sm whitespace-pre-wrap">{{ error }}</pre>
      </div>

      <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-3 items-start mb-6">
        <PluginConfigField
          v-for="(propSchema, key) in configSchema?.properties ?? {}"
          :key="key"
          :class="isWide(propSchema) ? 'col-span-full' : ''"
          :schema="propSchema"
          :field-key="String(key)"
          :label="prettifyKey(String(key))"
          :model-value="value.config[key]"
          @update:model-value="(val) => (value.config[key] = val)"
        />
      </div>

      <div v-if="overridesSchema" class="border-t border-border pt-4 mb-4">
        <PluginConfigField
          :schema="overridesSchema"
          field-key="overrides"
          label="Overrides"
          :model-value="value.overrides"
          @update:model-value="(val) => (value.overrides = val)"
        />
      </div>

      <button type="button" class="btn-primary" :disabled="saving" @click="save">
        <span v-if="saved">Saved!</span>
        <span v-else-if="saving">Saving...</span>
        <span v-else>Save</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, reactive, ref } from "vue";
import { ApiError, get, post } from "../../api";
import PluginConfigField from "./PluginConfigField.vue";
import { isWide, prettifyKey } from "./pluginConfigSchema";

const props = defineProps<{
  guildId: string;
  pluginName: string;
}>();

provide("pluginConfigGuildId", props.guildId);

const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const errors = ref<string[]>([]);
const schema = ref<any>(null);
// Holds { config: {...plugin config fields}, overrides: [...] } — matches the shape the backend serves so the
// two sections below can bind straight into it without any reshaping.
const value = reactive<{ config: Record<string, any>; overrides: any[] }>({ config: {}, overrides: [] });

const configSchema = computed(() => schema.value?.properties?.config ?? null);
const overridesSchema = computed(() => schema.value?.properties?.overrides ?? null);

onMounted(async () => {
  const result = await get(`guilds/${props.guildId}/config-schema/${props.pluginName}`);
  schema.value = result.schema;
  Object.assign(value, result.value);
  loading.value = false;
});

let savedTimeout: ReturnType<typeof setTimeout> | null = null;

async function save() {
  if (saving.value) return;

  saving.value = true;
  saved.value = false;
  errors.value = [];

  if (savedTimeout) {
    clearTimeout(savedTimeout);
  }

  try {
    await post(`guilds/${props.guildId}/config-schema/${props.pluginName}`, {
      value: { config: { ...value.config }, overrides: value.overrides },
    });
    saving.value = false;
    saved.value = true;
    savedTimeout = setTimeout(() => (saved.value = false), 3000);
  } catch (e) {
    saving.value = false;
    if (e instanceof ApiError && (e.status === 400 || e.status === 422)) {
      errors.value = e.body.errors || ["Error while saving config"];
      return;
    }
    throw e;
  }
}
</script>
