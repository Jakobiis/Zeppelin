<template>
  <div>
    <div v-if="loading">Loading...</div>
    <div v-else class="bg-card border border-border rounded-lg shadow-md p-6">
      <div v-if="errors.length" class="bg-muted border border-border py-2 px-3 rounded-lg shadow-md mb-4">
        <div class="font-semibold text-destructive">Errors:</div>
        <pre v-for="(error, i) in errors" :key="i" class="text-sm whitespace-pre-wrap">{{ error }}</pre>
      </div>

      <PluginConfigField
        v-for="(propSchema, key) in schema?.properties ?? {}"
        :key="key"
        :schema="propSchema"
        :label="prettifyKey(String(key))"
        :model-value="value[key]"
        @update:model-value="(val) => (value[key] = val)"
      />

      <button type="button" class="btn-primary" :disabled="saving" @click="save">
        <span v-if="saved">Saved!</span>
        <span v-else-if="saving">Saving...</span>
        <span v-else>Save</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ApiError, get, post } from "../../api";
import PluginConfigField from "./PluginConfigField.vue";

const props = defineProps<{
  guildId: string;
  pluginName: string;
}>();

const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const errors = ref<string[]>([]);
const schema = ref<any>(null);
const value = reactive<Record<string, any>>({});

function prettifyKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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
    await post(`guilds/${props.guildId}/config-schema/${props.pluginName}`, { value: { ...value } });
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
