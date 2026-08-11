<template>
  <div class="mb-4">
    <div v-if="label" class="flex items-center gap-2 mb-1">
      <label class="font-medium text-sm">{{ label }}</label>
      <button
        v-if="nullable"
        type="button"
        class="btn-sm"
        :class="isSet ? 'btn-secondary' : 'btn-primary'"
        @click="toggleNull(!isSet)"
      >
        {{ isSet ? "Unset" : "Set" }}
      </button>
    </div>
    <p v-if="description" class="text-sm text-muted-foreground mb-1">{{ description }}</p>

    <div v-if="nullable && !isSet" class="text-sm text-muted-foreground italic">Not set (using default)</div>

    <template v-else>
      <!-- boolean -->
      <label v-if="kind === 'boolean'" class="inline-flex items-center gap-2">
        <input
          type="checkbox"
          class="checkbox"
          :checked="!!modelValue"
          @change="emitUpdate(($event.target as HTMLInputElement).checked)"
        />
        <span class="text-sm text-muted-foreground">{{ modelValue ? "Enabled" : "Disabled" }}</span>
      </label>

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

      <!-- nested static object -->
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

      <!-- dynamic record (arbitrary string keys -> a shared value schema) -->
      <div v-else-if="kind === 'record'" class="pl-4 border-l border-border space-y-3">
        <div v-for="entry in recordEntries" :key="entry.uid" class="border border-border rounded-lg p-3">
          <div class="flex items-center gap-2 mb-2">
            <input
              type="text"
              class="flex-1 bg-input border border-border rounded-md px-2 py-1 font-mono text-sm"
              :value="entry.key"
              placeholder="key"
              @change="renameRecordKey(entry.key, ($event.target as HTMLInputElement).value)"
            />
            <button type="button" class="btn-sm btn-destructive" @click="removeRecordKey(entry.key)">Remove</button>
          </div>
          <PluginConfigField
            :schema="innerSchema.additionalProperties"
            :model-value="(modelValue ?? {})[entry.key]"
            @update:model-value="(val) => updateObjectKey(entry.key, val)"
          />
        </div>
        <button type="button" class="btn-sm btn-secondary" @click="addRecordKey">+ Add entry</button>
      </div>

      <!-- array -->
      <div v-else-if="kind === 'array'" class="pl-4 border-l border-border space-y-3">
        <div v-for="(item, index) in modelValue ?? []" :key="index" class="border border-border rounded-lg p-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-muted-foreground">Item {{ index + 1 }}</span>
            <button type="button" class="btn-sm btn-destructive" @click="removeArrayItem(index)">Remove</button>
          </div>
          <PluginConfigField
            :schema="innerSchema.items"
            :model-value="item"
            @update:model-value="(val) => updateArrayItem(index, val)"
          />
        </div>
        <button type="button" class="btn-sm btn-secondary" @click="addArrayItem">+ Add item</button>
      </div>

      <!-- union: let the user pick which shape this field currently holds -->
      <div v-else-if="kind === 'union'" class="pl-4 border-l border-border">
        <select
          class="bg-input border border-border rounded-md px-2 py-1 mb-2"
          :value="activeUnionBranchIndex"
          @change="switchUnionBranch(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="(branch, i) in innerSchema.anyOf" :key="i" :value="i">{{ branchLabel(branch, i) }}</option>
        </select>
        <PluginConfigField
          v-if="activeUnionBranchIndex !== null"
          :schema="innerSchema.anyOf[activeUnionBranchIndex]"
          :model-value="modelValue"
          @update:model-value="emitUpdate"
        />
      </div>

      <!-- fallback for anything not covered above (enums, tuples, etc.) -->
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
    </template>
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

// A nullable field is represented in JSON Schema as an `anyOf` with exactly one `{type: "null"}` branch (how
// zod's toJSONSchema exports `.nullable()`, including when nullable wraps a multi-branch union) — unwrap that
// into a `{ nullable, inner }` pair the rest of the component works with.
const nullableInfo = computed(() => {
  const s = props.schema;
  if (s?.anyOf && Array.isArray(s.anyOf)) {
    const nullBranches = s.anyOf.filter((b: any) => b.type === "null");
    const otherBranches = s.anyOf.filter((b: any) => b.type !== "null");
    if (nullBranches.length === 1 && otherBranches.length >= 1) {
      const inner = otherBranches.length === 1 ? otherBranches[0] : { anyOf: otherBranches };
      return { nullable: true, inner };
    }
  }
  return { nullable: false, inner: s };
});

const nullable = computed(() => nullableInfo.value.nullable);
const innerSchema = computed(() => nullableInfo.value.inner);
const isSet = computed(() => props.modelValue !== null && props.modelValue !== undefined);

const kind = computed(() => {
  const s = innerSchema.value;
  if (!s) return "unsupported";
  if (s.type === "boolean") return "boolean";
  if (s.type === "string" && !s.enum) return "string";
  if (s.type === "number" || s.type === "integer") return "number";
  if (s.type === "array" && s.items) return "array";
  if (s.type === "object" && s.properties) return "object";
  if (s.type === "object" && s.additionalProperties && typeof s.additionalProperties === "object") return "record";
  if (s.anyOf && Array.isArray(s.anyOf) && s.anyOf.length > 1) return "union";
  return "unsupported";
});

const description = computed(() => innerSchema.value?.description ?? null);

// Best-effort default value for a schema node — used when switching a nullable field from unset to set, adding
// a new array item, adding a new record entry, or switching a union's active branch.
function defaultForSchema(s: any): any {
  if (s == null) return null;
  if (s.default !== undefined) return s.default;
  if (s.anyOf) {
    const nonNull = s.anyOf.find((b: any) => b.type !== "null");
    return nonNull ? defaultForSchema(nonNull) : null;
  }
  if (s.type === "string") return "";
  if (s.type === "number" || s.type === "integer") return 0;
  if (s.type === "boolean") return false;
  if (s.type === "array") return [];
  if (s.type === "object") return {};
  return null;
}

function emitUpdate(value: any) {
  emit("update:modelValue", value);
}

function toggleNull(setValue: boolean) {
  emit("update:modelValue", setValue ? defaultForSchema(innerSchema.value) : null);
}

function updateObjectKey(key: string, value: any) {
  emit("update:modelValue", { ...(props.modelValue ?? {}), [key]: value });
}

function numberOrNull(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

// --- records (dynamic string-keyed objects) ---

let recordKeyCounter = 0;
const recordEntries = computed(() =>
  Object.keys(props.modelValue ?? {}).map((key) => ({ key, uid: key })),
);

function addRecordKey() {
  const obj = props.modelValue ?? {};
  let newKey = `new_key_${++recordKeyCounter}`;
  while (newKey in obj) {
    newKey = `new_key_${++recordKeyCounter}`;
  }
  emit("update:modelValue", { ...obj, [newKey]: defaultForSchema(innerSchema.value.additionalProperties) });
}

function removeRecordKey(key: string) {
  const obj = { ...(props.modelValue ?? {}) };
  delete obj[key];
  emit("update:modelValue", obj);
}

function renameRecordKey(oldKey: string, newKey: string) {
  if (!newKey || newKey === oldKey) return;
  const obj = { ...(props.modelValue ?? {}) };
  if (newKey in obj) return; // don't silently clobber an existing entry
  obj[newKey] = obj[oldKey];
  delete obj[oldKey];
  emit("update:modelValue", obj);
}

// --- arrays ---

function addArrayItem() {
  const arr = [...(props.modelValue ?? [])];
  arr.push(defaultForSchema(innerSchema.value.items));
  emit("update:modelValue", arr);
}

function removeArrayItem(index: number) {
  const arr = [...(props.modelValue ?? [])];
  arr.splice(index, 1);
  emit("update:modelValue", arr);
}

function updateArrayItem(index: number, value: any) {
  const arr = [...(props.modelValue ?? [])];
  arr[index] = value;
  emit("update:modelValue", arr);
}

// --- unions ---

function branchLabel(branch: any, index: number): string {
  if (branch.type === "string") return "Text";
  if (branch.type === "number" || branch.type === "integer") return "Number";
  if (branch.type === "boolean") return "Yes/No";
  if (branch.type === "array") return "List";
  if (branch.type === "object" && branch.properties) {
    const keys = Object.keys(branch.properties).slice(0, 3);
    return keys.length ? `Object (${keys.join(", ")})` : `Object ${index + 1}`;
  }
  return `Option ${index + 1}`;
}

function guessBranchIndex(): number | null {
  const branches: any[] = innerSchema.value?.anyOf ?? [];
  if (!branches.length) return null;

  const val = props.modelValue;
  const matchesType = (branch: any): boolean => {
    if (branch.type === "string") return typeof val === "string";
    if (branch.type === "number" || branch.type === "integer") return typeof val === "number";
    if (branch.type === "boolean") return typeof val === "boolean";
    if (branch.type === "array") return Array.isArray(val);
    if (branch.type === "object") return val != null && typeof val === "object" && !Array.isArray(val);
    return false;
  };

  if (val !== null && val !== undefined) {
    const i = branches.findIndex(matchesType);
    if (i !== -1) return i;
  }
  return 0;
}

const activeUnionBranchIndex = ref<number | null>(null);
watch(
  () => [innerSchema.value, props.modelValue],
  () => {
    if (kind.value === "union") {
      activeUnionBranchIndex.value = guessBranchIndex();
    }
  },
  { immediate: true },
);

function switchUnionBranch(index: number) {
  activeUnionBranchIndex.value = index;
  const branches: any[] = innerSchema.value?.anyOf ?? [];
  emit("update:modelValue", defaultForSchema(branches[index]));
}

// --- raw-JSON fallback for anything not covered above ---

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
