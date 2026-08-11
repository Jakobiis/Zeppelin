<template>
  <div class="mb-4">
    <label v-if="label" class="block mb-1 font-medium text-sm">{{ label }}</label>
    <p v-if="description" class="text-sm text-muted-foreground mb-1">{{ description }}</p>

    <!-- boolean -->
    <label v-if="kind === 'boolean'" class="inline-flex items-center gap-2">
      <input
        type="checkbox"
        :checked="!!modelValue"
        @change="emitUpdate(($event.target as HTMLInputElement).checked)"
      />
      <span class="text-sm text-muted-foreground">{{ modelValue ? "Enabled" : "Disabled" }}</span>
    </label>

    <!-- nullable wraps whatever the inner type is behind a "Set" checkbox -->
    <div v-else-if="nullable" class="flex items-start gap-2">
      <label class="inline-flex items-center gap-2 shrink-0 mt-1">
        <input
          type="checkbox"
          :checked="modelValue !== null && modelValue !== undefined"
          @change="toggleNull(($event.target as HTMLInputElement).checked)"
        />
        <span class="text-sm text-muted-foreground">Set</span>
      </label>
      <div class="flex-1" v-if="modelValue !== null && modelValue !== undefined">
        <PluginConfigField :schema="innerSchema" :model-value="modelValue" @update:model-value="emitUpdate" />
      </div>
    </div>

    <!-- nested object -->
    <div v-else-if="kind === 'object'" class="pl-4 border-l border-border">
      <PluginConfigField
        v-for="(propSchema, key) in innerSchema.properties"
        :key="key"
        :schema="propSchema"
        :label="prettifyKey(String(key))"
        :model-value="(modelValue ?? {})[key]"
        @update:model-value="(val) => updateObjectKey(String(key), val)"
      />
    </div>

    <!-- string -->
    <input
      v-else-if="kind === 'string'"
      type="text"
      class="w-full bg-input border border-border rounded-md px-2 py-1"
      :value="modelValue ?? ''"
      @input="emitUpdate(($event.target as HTMLInputElement).value)"
    />

    <!-- number -->
    <input
      v-else-if="kind === 'number'"
      type="number"
      class="w-full bg-input border border-border rounded-md px-2 py-1"
      :value="modelValue ?? ''"
      @input="emitUpdate(numberOrNull(($event.target as HTMLInputElement).value))"
    />

    <!-- fallback for anything the renderer doesn't understand yet (unions, arrays, enums, ...) -->
    <div v-else>
      <p class="text-xs text-muted-foreground mb-1">Complex field — edit as raw JSON.</p>
      <textarea
        class="w-full bg-input border border-border rounded-md px-2 py-1 font-mono text-sm"
        rows="3"
        :value="jsonText"
        @change="updateFromJsonText(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <p v-if="jsonError" class="text-xs text-destructive mt-1">{{ jsonError }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

defineOptions({
  name: "PluginConfigField",
});

const props = defineProps<{
  schema: any;
  label?: string;
  modelValue: any;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: any): void;
}>();

function prettifyKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// A nullable field is represented in JSON Schema as `anyOf: [X, {type: "null"}]` (how zod's toJSONSchema
// exports `.nullable()`) — unwrap that into a simple `{ nullable, inner }` pair the rest of the component works
// with instead of re-deriving this in every branch below.
const nullableInfo = computed(() => {
  const s = props.schema;
  if (s?.anyOf && Array.isArray(s.anyOf) && s.anyOf.length === 2) {
    const nullBranch = s.anyOf.find((b: any) => b.type === "null");
    const otherBranch = s.anyOf.find((b: any) => b.type !== "null");
    if (nullBranch && otherBranch) {
      return { nullable: true, inner: otherBranch };
    }
  }
  return { nullable: false, inner: s };
});

const nullable = computed(() => nullableInfo.value.nullable);
const innerSchema = computed(() => nullableInfo.value.inner);

const kind = computed(() => {
  const s = innerSchema.value;
  if (!s) return "unsupported";
  if (s.type === "boolean") return "boolean";
  if (s.type === "string" && !s.enum) return "string";
  if (s.type === "number" || s.type === "integer") return "number";
  if (s.type === "object" && s.properties) return "object";
  return "unsupported";
});

const description = computed(() => innerSchema.value?.description ?? null);

function emitUpdate(value: any) {
  emit("update:modelValue", value);
}

function toggleNull(setValue: boolean) {
  if (!setValue) {
    emit("update:modelValue", null);
    return;
  }

  const s = innerSchema.value;
  let defaultValue: any = s?.default ?? null;
  if (defaultValue == null) {
    if (s?.type === "string") defaultValue = "";
    else if (s?.type === "boolean") defaultValue = false;
    else if (s?.type === "number" || s?.type === "integer") defaultValue = 0;
    else if (s?.type === "object") defaultValue = {};
  }
  emit("update:modelValue", defaultValue);
}

function updateObjectKey(key: string, value: any) {
  emit("update:modelValue", { ...(props.modelValue ?? {}), [key]: value });
}

function numberOrNull(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

// Raw-JSON fallback for field types the structured renderer above doesn't handle
const jsonText = ref(JSON.stringify(props.modelValue ?? null, null, 2));
const jsonError = ref<string | null>(null);

watch(
  () => props.modelValue,
  (val) => {
    jsonText.value = JSON.stringify(val ?? null, null, 2);
  },
);

function updateFromJsonText(text: string) {
  try {
    const parsed = JSON.parse(text);
    jsonError.value = null;
    emit("update:modelValue", parsed);
  } catch {
    jsonError.value = "Invalid JSON";
  }
}
</script>
