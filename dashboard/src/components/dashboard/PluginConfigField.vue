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

      <!-- color picker -->
      <ColorPickerField
        v-else-if="kind === 'number' && specialKind === 'color'"
        class="mt-1"
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
           override's criteria) doesn't have to list all of them just to let you set one. Always rendered (no
           collapse) — see isCollapsible. -->
      <div v-else-if="kind === 'object'" class="field-panel">
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
        <ComboboxField
          v-if="hiddenObjectKeys.length"
          class="max-w-xs"
          :class="visibleObjectKeys.length ? 'mt-3' : ''"
          input-class="btn-add"
          reset-on-select
          placeholder="+ Add field…"
          :options="hiddenObjectFieldOptions"
          :model-value="null"
          @update:model-value="(key) => addObjectField(String(key))"
        />
      </div>

      <!-- dynamic record (arbitrary string keys -> a shared value schema) -->
      <div v-else-if="kind === 'record'" v-show="!collapsed" class="field-panel space-y-2 rounded-lg">
        <input
          v-if="recordEntries.length > 3"
          type="text"
          class="field-input text-sm"
          placeholder="Search…"
          v-model="recordSearch"
        />
        <div v-for="entry in filteredRecordEntries" :key="entry.uid">
          <div v-if="recordValueIsSimple" class="row-item max-w-[50%]">
            <RoleChannelPickerField
              v-if="(recordKeySpecialKind === 'role' || recordKeySpecialKind === 'channel') && guildId"
              class="w-48 shrink-0"
              :guild-id="guildId"
              :entity-type="recordKeySpecialKind"
              :model-value="entry.key"
              @update:model-value="(val) => renameRecordKey(entry.key, val ?? '')"
            />
            <EmojiPickerField
              v-else-if="recordKeySpecialKind === 'emoji' && guildId"
              class="w-48 shrink-0"
              :guild-id="guildId"
              :model-value="entry.key"
              @update:model-value="(val) => renameRecordKey(entry.key, val ?? '')"
            />
            <input
              v-else
              type="text"
              class="field-input w-48 shrink-0 font-mono text-sm"
              :value="entry.key"
              placeholder="key"
              @change="renameRecordKey(entry.key, ($event.target as HTMLInputElement).value)"
            />
            <PluginConfigField
              class="flex-1 min-w-0"
              :schema="innerSchema.additionalProperties"
              :forced-special-kind="specialKind"
              :model-value="(modelValue ?? {})[entry.key]"
              @update:model-value="(val) => updateObjectKey(entry.key, val)"
            />
            <button type="button" class="btn-remove btn-remove-icon shrink-0" aria-label="Remove" @click="removeRecordKey(entry.key)">
              <Close :size="10" fillColor="currentColor" style="font-size: 20px" />
            </button>
          </div>
          <div v-else class="item-card max-w-[50%]">
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
              <RoleChannelPickerField
                v-if="(recordKeySpecialKind === 'role' || recordKeySpecialKind === 'channel') && guildId"
                class="flex-1 min-w-0"
                :guild-id="guildId"
                :entity-type="recordKeySpecialKind"
                :model-value="entry.key"
                @update:model-value="(val) => renameRecordKey(entry.key, val ?? '')"
              />
              <EmojiPickerField
                v-else-if="recordKeySpecialKind === 'emoji' && guildId"
                class="flex-1 min-w-0"
                :guild-id="guildId"
                :model-value="entry.key"
                @update:model-value="(val) => renameRecordKey(entry.key, val ?? '')"
              />
              <input
                v-else
                type="text"
                class="field-input flex-1 min-w-0 font-mono text-sm"
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
        <p v-if="effectiveRecordSearch && !filteredRecordEntries.length" class="text-sm text-muted-foreground italic">No matches.</p>
        <button type="button" class="btn-secondary" @click="addRecordKey">+ Add entry</button>
      </div>

      <!-- array -->
      <div v-else-if="kind === 'array'" v-show="!collapsed" class="field-panel space-y-2 rounded-lg">
        <input
          v-if="(modelValue ?? []).length > 3"
          type="text"
          class="field-input text-sm"
          placeholder="Search…"
          v-model="arraySearch"
        />
        <template v-for="entry in filteredArrayEntries" :key="arrayItemUids[entry.index]">
          <!-- simple items: one compact row, value + remove, no card/header. Not width-capped for a special
               picker (role/channel/emoji) — those benefit from the extra room — only for a plain scalar list. -->
          <div v-if="itemsAreSimple" class="row-item" :class="specialKind ? '' : 'max-w-[50%]'">
            <PluginConfigField
              class="flex-1 min-w-0"
              :schema="innerSchema.items"
              :forced-special-kind="specialKind"
              :model-value="entry.item"
              @update:model-value="(val) => updateArrayItem(entry.index, val)"
            />
            <button type="button" class="btn-remove btn-remove-icon shrink-0" aria-label="Remove" @click="removeArrayItem(entry.index)">
              <Close :size="20" fillColor="currentColor" style="font-size: 20px" />
            </button>
          </div>
          <!-- complex items: collapsible, no text header, just a chevron + remove -->
          <div v-else class="item-card">
            <div class="item-card-header">
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground shrink-0 w-4 cursor-pointer"
                @click="toggleItemCollapsed(entry.index)"
              >
                <svg class="chevron-icon" :class="{ 'rotate-90': !isItemCollapsed(entry.index) }" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
              <span class="flex-1 text-sm text-muted-foreground truncate">
                {{ itemSummary(entry.item) || `Item ${entry.index + 1}` }}
              </span>
              <button type="button" class="btn-remove shrink-0" @click="removeArrayItem(entry.index)">Remove</button>
            </div>
            <div v-show="!isItemCollapsed(entry.index)" class="item-card-body">
              <PluginConfigField
                no-header
                :schema="innerSchema.items"
                :model-value="entry.item"
                @update:model-value="(val) => updateArrayItem(entry.index, val)"
              />
            </div>
          </div>
        </template>
        <p v-if="effectiveArraySearch && !filteredArrayEntries.length" class="text-sm text-muted-foreground italic">No matches.</p>
        <button type="button" class="btn-secondary" @click="addArrayItem">+ Add item</button>
      </div>

      <!-- "a single value, or a list of them" (e.g. override criteria like channel: string | string[], or a
           message's embeds: EmbedInput | EmbedInput[]) — edited as a plain list either way; emits a bare value,
           an array, or null depending on how many items end up in it, to match whichever branch of the union
           that represents. Simple items (a leaf value) get one compact row like a plain array does; complex ones
           (e.g. a whole embed) get the same collapsible item-card treatment array items get too. -->
      <div v-else-if="kind === 'union' && multiLeafSchema" class="field-panel space-y-2 rounded-lg">
        <div v-for="(item, index) in multiList" :key="multiItemUids[index]">
          <div v-if="multiLeafIsSimple" class="row-item">
            <PluginConfigField
              class="flex-1"
              :schema="multiLeafSchema"
              :forced-special-kind="specialKind"
              :model-value="item"
              @update:model-value="(val) => updateMultiItem(index, val)"
            />
            <button type="button" class="btn-remove btn-remove-icon shrink-0" aria-label="Remove" @click="removeMultiItem(index)">
              <Close :size="20" fillColor="currentColor" style="font-size: 20px" />
            </button>
          </div>
          <div v-else class="item-card">
            <div class="item-card-header">
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground shrink-0 w-4 cursor-pointer"
                @click="toggleMultiItemCollapsed(index)"
              >
                <svg class="chevron-icon" :class="{ 'rotate-90': !isMultiItemCollapsed(index) }" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
              <span class="flex-1 text-sm text-muted-foreground truncate">
                {{ multiItemSummary(item) || `Item ${index + 1}` }}
              </span>
              <button type="button" class="btn-remove shrink-0" @click="removeMultiItem(index)">Remove</button>
            </div>
            <div v-show="!isMultiItemCollapsed(index)" class="item-card-body">
              <PluginConfigField
                no-header
                :schema="multiLeafSchema"
                :model-value="item"
                @update:model-value="(val) => updateMultiItem(index, val)"
              />
            </div>
          </div>
        </div>
        <button type="button" class="btn-secondary" @click="addMultiItem">+ Add</button>
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
        <ComboboxField
          v-else
          class="max-w-xs mb-2"
          :options="unionBranchOptions"
          :model-value="activeUnionBranchIndex"
          @update:model-value="(i) => switchUnionBranch(Number(i))"
        />

        <PluginConfigField
          v-if="activeUnionBranchIndex !== null"
          :schema="innerSchema.anyOf[activeUnionBranchIndex]"
          :model-value="modelValue"
          @update:model-value="emitUpdate"
        />

        <!-- Live Discord-message-style preview, kept in sync as the fields above are edited — only for fields
             shaped like Zeppelin's message content (a plain string, or {content, tts, embeds}). -->
        <template v-if="isMessageContentField">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-2">Preview</p>
          <MessagePreview :value="modelValue" />
        </template>
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
import { computed, inject, ref, watch, type ComputedRef } from "vue";
import Close from "vue-material-design-icons/Close.vue";
import ColorPickerField from "./ColorPickerField.vue";
import ComboboxField from "./ComboboxField.vue";
import { getCachedName } from "./discordGuildData";
import EmojiPickerField from "./EmojiPickerField.vue";
import MessagePreview from "./MessagePreview.vue";
import {
  classifyKind,
  defaultForSchema,
  detectMultiLeafSchema,
  detectRecordKeySpecialKind,
  detectSpecialFieldKind,
  isSimple,
  isWide,
  prettifyKey,
  schemaValueMatchesSearch,
  SpecialFieldKind,
  summarizeObjectValue,
  unwrapNullable,
  useOrderedObjectFieldKeys,
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

// Plain objects (as opposed to arrays/records, which can hold many entries and genuinely benefit from
// collapsing) are excluded here — they're small enough (a handful of fields) that a collapse chevron is just
// one more click in the way, most annoyingly right after adding one via "+ Add field": you'd reveal it in the
// list only to have to click again just to see what's inside it. Objects always render fully expanded instead.
const isCollapsible = computed(() => kind.value === "array" || kind.value === "record");
const showChevron = computed(() => isCollapsible.value && !props.noHeader);
// Starts expanded when noHeader is set, there'd otherwise be no chevron left to un-collapse it with.
const collapsed = ref(!props.noHeader);

// Interface-wide search (see GuildConfigEditor's provide()) — whether this field's own label, or anything
// inside it, matches the current query. Used both to filter which of a container's children get rendered at
// all (see visibleObjectKeys below) and to auto-expand a container that contains a match but isn't already open.
const searchQuery = inject<ComputedRef<string>>("pluginConfigSearchQuery", computed(() => ""));
const matchesSearch = computed(() => {
  const q = searchQuery.value.trim();
  if (!q) return true;
  if (props.label && props.label.toLowerCase().includes(q.toLowerCase())) return true;
  return schemaValueMatchesSearch(props.schema, props.modelValue, q);
});
watch(
  () => [searchQuery.value.trim(), matchesSearch.value, isCollapsible.value] as const,
  ([q, matches, collapsible]) => {
    if (q && matches && collapsible) collapsed.value = false;
  },
  { immediate: true },
);

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

// --- nested static objects: which properties are worth showing right now (see useOrderedObjectFieldKeys) ---

const { visible: rawVisibleObjectKeys, hidden: hiddenObjectKeys } = useOrderedObjectFieldKeys(
  innerSchema,
  computed(() => props.modelValue),
);

// Further narrows to fields matching the interface-wide search, same as PluginConfigForm's top-level fields —
// this is what lets searching surface one specific property several levels deep in a plugin's config tree.
const visibleObjectKeys = computed(() => {
  const q = searchQuery.value.trim();
  if (!q) return rawVisibleObjectKeys.value;
  return rawVisibleObjectKeys.value.filter((key) => {
    if (prettifyKey(key).toLowerCase().includes(q.toLowerCase())) return true;
    return schemaValueMatchesSearch(innerSchema.value?.properties?.[key], (props.modelValue ?? {})[key], q);
  });
});

function addObjectField(key: string) {
  if (!key) return;
  updateObjectKey(key, defaultForSchema(innerSchema.value?.properties?.[key]));
}

const hiddenObjectFieldOptions = computed(() => hiddenObjectKeys.value.map((key) => ({ value: key, label: prettifyKey(key) })));

function numberOrNull(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

// --- records (dynamic string-keyed objects) ---

const recordValueIsSimple = computed(() => isSimple(innerSchema.value?.additionalProperties));
const recordKeySpecialKind = computed(() => (kind.value === "record" ? detectRecordKeySpecialKind(props.fieldKey) : null));

let recordKeyCounter = 0;
const recordEntries = computed(() => Object.keys(props.modelValue ?? {}).map((key) => ({ key, uid: key })));

// Filters entries by key or by anything inside a complex value — records like a plugin's "games" or "counters"
// can get long enough that scrolling to find one by hand is a chore. The local box (only shown once there's
// enough entries to matter — see template) takes precedence when typed in; otherwise this falls back to the
// interface-wide search bar, so a global search that matched something inside this record also narrows it down
// without needing to type the same query twice.
const recordSearch = ref("");
const effectiveRecordSearch = computed(() => recordSearch.value.trim() || searchQuery.value.trim());
const filteredRecordEntries = computed(() => {
  const q = effectiveRecordSearch.value.toLowerCase();
  if (!q) return recordEntries.value;
  return recordEntries.value.filter((entry) => {
    if (entry.key.toLowerCase().includes(q)) return true;
    return schemaValueMatchesSearch(innerSchema.value?.additionalProperties, (props.modelValue ?? {})[entry.key], q);
  });
});

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
  let newKey = `key${++recordKeyCounter}`;
  while (newKey in obj) {
    newKey = `key${++recordKeyCounter}`;
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

// Filters items by their content (or, for simple items, their raw value) — same rationale as recordSearch above,
// for arrays like overrides that can get long. Falls back to the interface-wide search bar when the local box
// (see recordSearch) is empty. Keeps each item's original index (used by update/remove/collapse below) alongside
// it, since filtering would otherwise shift indices out from under them.
const arraySearch = ref("");
const effectiveArraySearch = computed(() => arraySearch.value.trim() || searchQuery.value.trim());
const filteredArrayEntries = computed(() => {
  const list = Array.isArray(props.modelValue) ? props.modelValue : [];
  const q = effectiveArraySearch.value.toLowerCase();
  return list
    .map((item: any, index: number) => ({ item, index }))
    .filter(({ item }) => {
      if (!q) return true;
      if (itemsAreSimple.value) return String(item ?? "").toLowerCase().includes(q);
      return schemaValueMatchesSearch(innerSchema.value?.items, item, q);
    });
});

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

const multiLeafIsSimple = computed(() => isSimple(multiLeafSchema.value));

// Schema for a complex leaf's own properties, used only to build the collapsed-item summary — same idea as
// arrayItemsPropsSchema below, for the "single T or T[]" case instead of a plain array.
const multiLeafPropsSchema = computed(() => {
  const leaf = multiLeafSchema.value;
  return leaf ? unwrapNullable(leaf).inner?.properties : undefined;
});
function multiItemSummary(item: any): string {
  return summarizeObjectValue(item, multiLeafPropsSchema.value, resolveSpecialLabel);
}

// Same synthetic-id-per-item approach as arrayItemUids below (see its comment) — kept separate since a field
// can only ever be one kind, so there's no risk of the two colliding.
let multiItemUidCounter = 0;
const multiItemUids = ref<number[]>(
  Array.isArray(props.modelValue) ? props.modelValue.map(() => ++multiItemUidCounter) : props.modelValue != null ? [++multiItemUidCounter] : [],
);
const collapsedMultiItemUids = ref<Set<number>>(new Set(multiItemUids.value));
function isMultiItemCollapsed(index: number): boolean {
  const uid = multiItemUids.value[index];
  return uid === undefined ? true : collapsedMultiItemUids.value.has(uid);
}
function toggleMultiItemCollapsed(index: number) {
  const uid = multiItemUids.value[index];
  if (uid === undefined) return;
  const next = new Set(collapsedMultiItemUids.value);
  if (next.has(uid)) next.delete(uid);
  else next.add(uid);
  collapsedMultiItemUids.value = next;
}

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
  multiItemUids.value = [...multiItemUids.value, ++multiItemUidCounter];
  emitMultiList([...multiList.value, defaultForSchema(multiLeafSchema.value)]);
}

function removeMultiItem(index: number) {
  const list = [...multiList.value];
  list.splice(index, 1);
  const uids = [...multiItemUids.value];
  const [removedUid] = uids.splice(index, 1);
  multiItemUids.value = uids;
  if (removedUid !== undefined && collapsedMultiItemUids.value.has(removedUid)) {
    const next = new Set(collapsedMultiItemUids.value);
    next.delete(removedUid);
    collapsedMultiItemUids.value = next;
  }
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
  if (branch.type === "string") return "Plain text";
  if (branch.type === "number" || branch.type === "integer") return "Fixed value";
  if (branch.type === "boolean") return "Yes/No";
  if (branch.type === "array") return "List";
  if (branch.type === "object" && branch.properties) {
    // Zeppelin's message-content shape specifically — "Content / Tts / Embeds" (its first 3 property names,
    // the generic fallback below) doesn't read as anything meaningful the way e.g. "Min / Max" does.
    if ("content" in branch.properties && ("embeds" in branch.properties || "embed" in branch.properties)) {
      return "Rich message";
    }
    const keys = Object.keys(branch.properties).slice(0, 3);
    return keys.length ? keys.map(prettifyKey).join(" / ") : `Object ${index + 1}`;
  }
  return `Option ${index + 1}`;
}

const unionBranchOptions = computed(() => (innerSchema.value?.anyOf ?? []).map((branch: any, i: number) => ({ value: i, label: branchLabel(branch, i) })));

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

// Recognizes Zeppelin's "message content" shape (a plain string, or { content?, tts?, embeds?/embed? }) by its
// structure — reliable enough given how specific that combination of property names is — so a live preview can
// be shown without needing every message-content field to be hardcoded by name/plugin.
const isMessageContentField = computed(() => {
  if (!isScalarOrObjectUnion.value) return false;
  const objProps = innerSchema.value?.anyOf?.[objectBranchIndex.value]?.properties ?? {};
  return "content" in objProps && ("embeds" in objProps || "embed" in objProps);
});

function guessBranchIndex(): number | null {
  const branches: any[] = innerSchema.value?.anyOf ?? [];
  if (!branches.length) return null;

  const val = props.modelValue;

  if (val != null && typeof val === "object" && !Array.isArray(val)) {
    // Discriminated-union branches (e.g. a game's wager/reward/blackjack/pvp/hol types) are every one of them a
    // plain object, so a generic "which branch's *shape* matches this value" check below can't tell them apart
    // — it'd always just hit whichever object branch comes first. Match on the actual discriminator value first
    // (e.g. `type: "hol"`) so opening an existing entry shows the branch it's actually configured as, not
    // whichever one happens to be listed first.
    const discriminatedIndex = branches.findIndex((b) => {
      const discriminatorKey = Object.keys(b?.properties ?? {}).find((k) => b.properties[k]?.const !== undefined);
      return discriminatorKey != null && val[discriminatorKey] === b.properties[discriminatorKey].const;
    });
    if (discriminatedIndex !== -1) return discriminatedIndex;
  }

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
