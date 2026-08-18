<template>
  <div>
    <div v-if="label || showChevron || nullable" class="flex items-center gap-2">
      <button
        v-if="showChevron"
        type="button"
        class="text-muted-foreground hover:text-foreground shrink-0 w-4 cursor-pointer"
        :aria-label="collapsed ? 'Expand' : 'Collapse'"
        @click="collapsed = !collapsed"
      >
        <svg class="chevron-icon" :class="{ 'rotate-90': !collapsed }" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>

      <input
        v-if="showInlineBoolean"
        type="checkbox"
        class="checkbox shrink-0"
        :checked="!!modelValue"
        @change="emitUpdate(($event.target as HTMLInputElement).checked)"
      />

      <label
        v-if="label"
        class="font-medium text-sm"
        :class="showChevron ? 'cursor-pointer select-none' : ''"
        @click="showChevron && (collapsed = !collapsed)"
      >{{ label }}</label>

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
    <p v-if="description" class="text-sm text-muted-foreground mt-0.5">{{ description }}</p>

    <div v-if="nullable && !isSet" class="text-sm text-muted-foreground italic mt-1.5">Not set — using default</div>

    <template v-else>
      <!-- boolean (only rendered here when it couldn't be shown inline in the header above, e.g. no label) —
           the showInlineBoolean branch is a no-op template so a boolean kind never falls through to the raw-JSON
           fallback below just because its checkbox was already drawn in the header. -->
      <input
        v-if="kind === 'boolean' && !showInlineBoolean"
        type="checkbox"
        class="checkbox mt-1"
        :checked="!!modelValue"
        @change="emitUpdate(($event.target as HTMLInputElement).checked)"
      />
      <template v-else-if="kind === 'boolean'"></template>

      <!-- role / channel picker -->
      <RoleChannelPickerField
        v-else-if="kind === 'string' && (specialKind === 'role' || specialKind === 'channel') && guildId"
        class="mt-1"
        :guild-id="guildId"
        :entity-type="specialKind"
        :model-value="modelValue"
        @update:model-value="emitUpdate"
      />

      <!-- emoji picker -->
      <EmojiPickerField
        v-else-if="kind === 'string' && specialKind === 'emoji' && guildId"
        class="mt-1"
        :guild-id="guildId"
        :model-value="modelValue"
        @update:model-value="emitUpdate"
      />

      <!-- string -->
      <input
        v-else-if="kind === 'string'"
        type="text"
        class="field-input mt-1"
        :placeholder="modelValue == null ? 'Not set' : ''"
        :value="modelValue ?? ''"
        @input="emitUpdate(($event.target as HTMLInputElement).value)"
      />

      <!-- number -->
      <input
        v-else-if="kind === 'number'"
        type="number"
        class="field-input mt-1"
        :placeholder="modelValue == null ? 'Not set' : ''"
        :value="modelValue ?? ''"
        @input="emitUpdate(numberOrNull(($event.target as HTMLInputElement).value))"
      />

      <!-- nested static object: grid so related fields sit side by side instead of one long column. Only
           required fields and optional fields that already hold a value take up space here — the rest are
           reachable through "+ Add field" below so an object with mostly-unused optional properties (like an
           override's criteria) doesn't have to list all of them just to let you set one. -->
      <div v-else-if="kind === 'object'" v-show="!collapsed" class="field-panel">
        <div
          v-if="visibleObjectKeys.length"
          class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-3 items-start"
        >
          <PluginConfigField
            v-for="key in visibleObjectKeys"
            :key="key"
            :class="[isWide(innerSchema.properties[key], key) ? 'col-span-full' : '', key === 'config' ? 'border-t border-border pt-3' : '']"
            :schema="innerSchema.properties[key]"
            :field-key="key"
            :label="prettifyKey(key)"
            :model-value="(modelValue ?? {})[key]"
            @update:model-value="(val) => updateObjectKey(key, val)"
          />
        </div>
        <select
          v-if="hiddenObjectKeys.length"
          class="btn-add select-arrow"
          :class="visibleObjectKeys.length ? 'mt-3' : ''"
          value=""
          @change="addObjectField(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
        >
          <option value="" disabled>+ Add field…</option>
          <option v-for="key in hiddenObjectKeys" :key="key" :value="key">{{ prettifyKey(key) }}</option>
        </select>
      </div>

      <!-- dynamic record (arbitrary string keys -> a shared value schema) -->
      <div v-else-if="kind === 'record'" v-show="!collapsed" class="field-panel space-y-2">
        <div v-for="entry in recordEntries" :key="entry.uid">
          <div v-if="recordValueIsSimple" class="flex items-center gap-2">
            <input
              type="text"
              class="field-input w-40 shrink-0 font-mono text-sm"
              :value="entry.key"
              placeholder="key"
              @change="renameRecordKey(entry.key, ($event.target as HTMLInputElement).value)"
            />
            <PluginConfigField
              class="flex-1"
              :schema="innerSchema.additionalProperties"
              :forced-special-kind="specialKind"
              :model-value="(modelValue ?? {})[entry.key]"
              @update:model-value="(val) => updateObjectKey(entry.key, val)"
            />
            <button type="button" class="btn-remove shrink-0" @click="removeRecordKey(entry.key)">Remove</button>
          </div>
          <div v-else class="item-card">
            <div class="item-card-header">
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground shrink-0 w-4 cursor-pointer"
                @click="toggleEntryCollapsed(entry.key)"
              >
                <svg class="chevron-icon" :class="{ 'rotate-90': !isEntryCollapsed(entry.key) }" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
              <input
                type="text"
                class="field-input flex-1 font-mono text-sm"
                :value="entry.key"
                placeholder="key"
                @change="renameRecordKey(entry.key, ($event.target as HTMLInputElement).value)"
              />
              <button type="button" class="btn-remove shrink-0" @click="removeRecordKey(entry.key)">Remove</button>
            </div>
            <div v-show="!isEntryCollapsed(entry.key)" class="item-card-body">
              <PluginConfigField
                no-header
                :schema="innerSchema.additionalProperties"
                :model-value="(modelValue ?? {})[entry.key]"
                @update:model-value="(val) => updateObjectKey(entry.key, val)"
              />
            </div>
          </div>
        </div>
        <button type="button" class="btn-add" @click="addRecordKey">+ Add entry</button>
      </div>

      <!-- array -->
      <div v-else-if="kind === 'array'" v-show="!collapsed" class="field-panel space-y-2">
        <template v-for="(item, index) in modelValue ?? []" :key="arrayItemUids[index]">
          <!-- simple items: one compact row, value + remove, no card/header -->
          <div v-if="itemsAreSimple" class="flex items-center gap-2">
            <PluginConfigField
              class="flex-1"
              :schema="innerSchema.items"
              :forced-special-kind="specialKind"
              :model-value="item"
              @update:model-value="(val) => updateArrayItem(index, val)"
            />
            <button type="button" class="btn-remove shrink-0" @click="removeArrayItem(index)">Remove</button>
          </div>
          <!-- complex items: collapsible, no text header, just a chevron + remove -->
          <div v-else class="item-card">
            <div class="item-card-header">
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground shrink-0 w-4 cursor-pointer"
                @click="toggleItemCollapsed(index)"
              >
                <svg class="chevron-icon" :class="{ 'rotate-90': !isItemCollapsed(index) }" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
              <span v-if="itemSummary(item)" class="flex-1 text-sm text-muted-foreground truncate">{{ itemSummary(item) }}</span>
              <div v-else class="flex-1"></div>
              <button type="button" class="btn-remove shrink-0" @click="removeArrayItem(index)">Remove</button>
            </div>
            <div v-show="!isItemCollapsed(index)" class="item-card-body">
              <PluginConfigField
                no-header
                :schema="innerSchema.items"
                :model-value="item"
                @update:model-value="(val) => updateArrayItem(index, val)"
              />
            </div>
          </div>
        </template>
        <button type="button" class="btn-add" @click="addArrayItem">+ Add item</button>
      </div>

      <!-- "a single value, or a list of them" (e.g. override criteria like channel: string | string[]) —
           edited as a plain list either way; emits a bare value, an array, or null depending on how many items
           end up in it, to match whichever branch of the union that represents. -->
      <div v-else-if="kind === 'union' && multiLeafSchema" class="field-panel space-y-2">
        <div v-for="(item, index) in multiList" :key="index" class="flex items-center gap-2">
          <PluginConfigField
            class="flex-1"
            :schema="multiLeafSchema"
            :forced-special-kind="specialKind"
            :model-value="item"
            @update:model-value="(val) => updateMultiItem(index, val)"
          />
          <button type="button" class="btn-remove shrink-0" @click="removeMultiItem(index)">Remove</button>
        </div>
        <button type="button" class="btn-add" @click="addMultiItem">+ Add</button>
      </div>

      <!-- union -->
      <div v-else-if="kind === 'union'" class="mt-2">
        <template v-if="isScalarOrObjectUnion">
          <p class="text-xs text-muted-foreground mb-2">
            Choose {{ branchLabel(innerSchema.anyOf[scalarBranchIndex], scalarBranchIndex).toLowerCase() }} or
            {{ branchLabel(innerSchema.anyOf[objectBranchIndex], objectBranchIndex).toLowerCase() }} — whichever
            you pick below is what's actually used.
          </p>
          <div class="flex gap-2 mb-2">
            <button
              type="button"
              class="btn-sm"
              :class="activeUnionBranchIndex === scalarBranchIndex ? 'btn-primary' : 'btn-secondary'"
              @click="switchUnionBranch(scalarBranchIndex)"
            >
              {{ branchLabel(innerSchema.anyOf[scalarBranchIndex], scalarBranchIndex) }}
            </button>
            <button
              type="button"
              class="btn-sm"
              :class="activeUnionBranchIndex === objectBranchIndex ? 'btn-primary' : 'btn-secondary'"
              @click="switchUnionBranch(objectBranchIndex)"
            >
              {{ branchLabel(innerSchema.anyOf[objectBranchIndex], objectBranchIndex) }}
            </button>
          </div>
        </template>

        <!-- generic multi-branch union (e.g. a discriminated union of genuinely different shapes) -->
        <select
          v-else
          class="field-input select-arrow mb-2"
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
        <p class="text-xs text-muted-foreground mb-1 mt-1">Complex field — edit as raw JSON.</p>
        <textarea
          class="field-input"
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
import { computed, inject, ref, watch } from "vue";
import { getCachedName } from "./discordGuildData";
import EmojiPickerField from "./EmojiPickerField.vue";
import {
  classifyKind,
  defaultForSchema,
  detectMultiLeafSchema,
  detectSpecialFieldKind,
  getObjectFieldKeys,
  isSimple,
  isWide,
  prettifyKey,
  SpecialFieldKind,
  summarizeObjectValue,
  unwrapNullable,
} from "./pluginConfigSchema";
import RoleChannelPickerField from "./RoleChannelPickerField.vue";

defineOptions({
  name: "PluginConfigField",
});

const props = defineProps<{
  schema: any;
  label?: string;
  fieldKey?: string;
  forcedSpecialKind?: SpecialFieldKind | null;
  // Set by a parent that's already rendering its own collapse chevron for this field (e.g. a record entry or
  // array item) — suppresses this instance's own chevron/collapse so expanding the parent's chevron doesn't
  // reveal a second, redundant one before you see any actual content.
  noHeader?: boolean;
  modelValue: any;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: any): void;
}>();

const guildId = inject<string | null>("pluginConfigGuildId", null);

const nullableInfo = computed(() => unwrapNullable(props.schema));
const nullable = computed(() => nullableInfo.value.nullable);
const innerSchema = computed(() => nullableInfo.value.inner);
const isSet = computed(() => props.modelValue !== null && props.modelValue !== undefined);

const kind = computed(() => classifyKind(innerSchema.value));

// "a single value, or a list of them" — see the template comment above the field that uses this.
const multiLeafSchema = computed(() => (kind.value === "union" ? detectMultiLeafSchema(innerSchema.value) : null));

const specialKind = computed(() => props.forcedSpecialKind ?? detectSpecialFieldKind(props.fieldKey, props.schema));

const isCollapsible = computed(() => kind.value === "object" || kind.value === "array" || kind.value === "record");
const showChevron = computed(() => isCollapsible.value && !props.noHeader);
// Starts expanded when noHeader is set, since there'd otherwise be no chevron left to un-collapse it with.
const collapsed = ref(!props.noHeader);

// A labeled, non-nullable boolean renders its checkbox in the header row (next to the label) instead of on its
// own line below — this is what lets a page full of toggles stay compact instead of every single one costing
// two lines (label line + checkbox line).
const showInlineBoolean = computed(() => kind.value === "boolean" && !!props.label && (!nullable.value || isSet.value));

const description = computed(() => innerSchema.value?.description ?? null);

function emitUpdate(value: any) {
  emit("update:modelValue", value);
}

function toggleNull(setValue: boolean) {
  emit("update:modelValue", setValue ? defaultForSchema(innerSchema.value) : null);
}

function updateObjectKey(key: string, value: any) {
  emit("update:modelValue", { ...(props.modelValue ?? {}), [key]: value });
}

// --- nested static objects: which properties are worth showing right now (see getObjectFieldKeys) ---

const objectFieldKeys = computed(() => getObjectFieldKeys(innerSchema.value, props.modelValue));
const visibleObjectKeys = computed(() => objectFieldKeys.value.visible);
const hiddenObjectKeys = computed(() => objectFieldKeys.value.hidden);

function addObjectField(key: string) {
  if (!key) return;
  updateObjectKey(key, defaultForSchema(innerSchema.value?.properties?.[key]));
}

function numberOrNull(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

// --- records (dynamic string-keyed objects) ---

const recordValueIsSimple = computed(() => isSimple(innerSchema.value?.additionalProperties));

let recordKeyCounter = 0;
const recordEntries = computed(() => Object.keys(props.modelValue ?? {}).map((key) => ({ key, uid: key })));

// Starts with every existing entry collapsed, matching objects/arrays — newly added entries (below) are left
// out of this set so they open expanded and ready to edit.
const collapsedEntryKeys = ref<Set<string>>(new Set(Object.keys(props.modelValue ?? {})));
function isEntryCollapsed(key: string): boolean {
  return collapsedEntryKeys.value.has(key);
}
function toggleEntryCollapsed(key: string) {
  const next = new Set(collapsedEntryKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedEntryKeys.value = next;
}

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
  if (collapsedEntryKeys.value.has(key)) {
    const next = new Set(collapsedEntryKeys.value);
    next.delete(key);
    collapsedEntryKeys.value = next;
  }
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

const itemsAreSimple = computed(() => isSimple(innerSchema.value?.items));

// Schema for a complex item's own properties, used only to order/pick which values show up in the collapsed
// summary below — falls back to {} (empty summary) for item shapes that aren't a plain object (e.g. a union).
const arrayItemsPropsSchema = computed(() => {
  const items = innerSchema.value?.items;
  return items ? unwrapNullable(items).inner?.properties : undefined;
});

// Resolves a role/channel id to its actual name for the collapsed-item summary (e.g. an override's "Channel:
// 1286064050765299814" becoming "Channel: #general") — only once that guild's role/channel list has actually
// been fetched (which happens as a side effect of the matching picker field mounting elsewhere in this same
// form; see discordGuildData's reactive name cache). Falls back to the raw id until then. Emoji values aren't
// bare ids (they're either a unicode emoji or a `<:name:id>` mention that already spells out the name), so
// there's nothing to resolve for those.
function resolveSpecialLabel(key: string, schema: any, rawValue: string): string | null {
  if (!guildId) return null;
  const kind = detectSpecialFieldKind(key, schema);
  if (kind === "channel") {
    const name = getCachedName("channel", guildId, rawValue);
    return name ? `#${name}` : null;
  }
  if (kind === "role") {
    return getCachedName("role", guildId, rawValue);
  }
  return null;
}

function itemSummary(item: any): string {
  return summarizeObjectValue(item, arrayItemsPropsSchema.value, resolveSpecialLabel);
}

// Array items are only identified by index, which shifts on removal — track a stable synthetic id per item
// (in step with add/remove) so each item's collapse state doesn't jump to a different item after a removal.
// This computation runs for every field instance regardless of kind (a field only knows its own kind once its
// computeds evaluate), so it must tolerate a non-array modelValue — most fields have one.
let arrayItemUidCounter = 0;
const arrayItemUids = ref<number[]>(
  Array.isArray(props.modelValue) ? props.modelValue.map(() => ++arrayItemUidCounter) : [],
);
const collapsedItemUids = ref<Set<number>>(new Set(arrayItemUids.value));

function isItemCollapsed(index: number): boolean {
  const uid = arrayItemUids.value[index];
  return uid === undefined ? true : collapsedItemUids.value.has(uid);
}

function toggleItemCollapsed(index: number) {
  const uid = arrayItemUids.value[index];
  if (uid === undefined) return;
  const next = new Set(collapsedItemUids.value);
  if (next.has(uid)) next.delete(uid);
  else next.add(uid);
  collapsedItemUids.value = next;
}

function addArrayItem() {
  const arr = [...(props.modelValue ?? [])];
  arr.push(defaultForSchema(innerSchema.value.items));
  arrayItemUids.value = [...arrayItemUids.value, ++arrayItemUidCounter];
  emit("update:modelValue", arr);
}

function removeArrayItem(index: number) {
  const arr = [...(props.modelValue ?? [])];
  arr.splice(index, 1);
  const uids = [...arrayItemUids.value];
  const [removedUid] = uids.splice(index, 1);
  arrayItemUids.value = uids;
  if (removedUid !== undefined && collapsedItemUids.value.has(removedUid)) {
    const next = new Set(collapsedItemUids.value);
    next.delete(removedUid);
    collapsedItemUids.value = next;
  }
  emit("update:modelValue", arr);
}

function updateArrayItem(index: number, value: any) {
  const arr = [...(props.modelValue ?? [])];
  arr[index] = value;
  emit("update:modelValue", arr);
}

// --- "single value or list" fields (see multiLeafSchema above) ---

// Normalizes the current value (which could be null, a bare value, or an array, depending on which union
// branch it currently matches) into a plain list for editing.
const multiList = computed<any[]>(() => {
  const val = props.modelValue;
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
});

// Converts the edited list back to whichever shape actually matches the union: null when empty, a bare value
// when there's exactly one, or an array when there's more than one.
function emitMultiList(list: any[]) {
  if (list.length === 0) emit("update:modelValue", null);
  else if (list.length === 1) emit("update:modelValue", list[0]);
  else emit("update:modelValue", list);
}

function addMultiItem() {
  emitMultiList([...multiList.value, defaultForSchema(multiLeafSchema.value)]);
}

function removeMultiItem(index: number) {
  const list = [...multiList.value];
  list.splice(index, 1);
  emitMultiList(list);
}

function updateMultiItem(index: number, value: any) {
  const list = [...multiList.value];
  list[index] = value;
  emitMultiList(list);
}

// --- unions ---

// Labels a union branch — prefers a discriminated union's literal discriminator value (e.g. `type: "wager"`)
// when present, since that's a far better label than a generic shape description.
function branchLabel(branch: any, index: number): string {
  const discriminatorConst = Object.values(branch?.properties ?? {}).find((p: any) => p?.const !== undefined) as
    | { const: unknown }
    | undefined;
  if (discriminatorConst) {
    return prettifyKey(String(discriminatorConst.const));
  }
  if (branch.type === "string" || branch.type === "number" || branch.type === "integer") return "Fixed value";
  if (branch.type === "boolean") return "Yes/No";
  if (branch.type === "array") return "List";
  if (branch.type === "object" && branch.properties) {
    const keys = Object.keys(branch.properties).slice(0, 3);
    return keys.length ? keys.map(prettifyKey).join(" / ") : `Object ${index + 1}`;
  }
  return `Option ${index + 1}`;
}

// A common, safe-to-simplify shape: "a flat value, or an object with more detail" (e.g. a plain number vs. a
// {min, max} range). These get a 2-button toggle with an explanatory note instead of a generic dropdown.
const scalarBranchIndex = computed(() => {
  const branches: any[] = innerSchema.value?.anyOf ?? [];
  return branches.findIndex((b) => ["string", "number", "boolean"].includes(classifyKind(unwrapNullable(b).inner)));
});
const objectBranchIndex = computed(() => {
  const branches: any[] = innerSchema.value?.anyOf ?? [];
  return branches.findIndex((b) => classifyKind(unwrapNullable(b).inner) === "object");
});
const isScalarOrObjectUnion = computed(() => {
  const branches: any[] = innerSchema.value?.anyOf ?? [];
  return branches.length === 2 && scalarBranchIndex.value !== -1 && objectBranchIndex.value !== -1;
});

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
