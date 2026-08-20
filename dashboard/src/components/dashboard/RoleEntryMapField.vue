<template>
  <div class="field-panel space-y-2">
    <div v-if="!modelValue.length" class="text-sm text-muted-foreground italic">None</div>
    <div v-for="(entry, index) in modelValue" :key="index" class="row-item">
      <RoleChannelPickerField
        class="flex-1"
        :guild-id="guildId"
        entity-type="role"
        :model-value="entry.role_id"
        @update:model-value="(val) => updateRole(index, val)"
      />
      <input
        type="number"
        min="1"
        max="100"
        class="field-input w-24"
        :value="entry.bonus"
        @input="(ev) => updateBonus(index, (ev.target as HTMLInputElement).value)"
      />
      <span class="text-sm text-muted-foreground shrink-0">bonus entries</span>
      <button type="button" class="btn-remove btn-remove-icon shrink-0" aria-label="Remove" @click="removeAt(index)">
        <Close :size="16" fillColor="currentColor" style="font-size: 16px" />
      </button>
    </div>
    <button type="button" class="btn-add" @click="addEmpty">+ Add bonus</button>
  </div>
</template>

<script setup lang="ts">
import Close from "vue-material-design-icons/Close.vue";
import RoleChannelPickerField from "./RoleChannelPickerField.vue";

export interface RoleEntryMapRow {
  role_id: string | null;
  bonus: number;
}

const props = defineProps<{
  guildId: string;
  modelValue: RoleEntryMapRow[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: RoleEntryMapRow[]): void;
}>();

function updateRole(index: number, roleId: string | null) {
  const next = [...props.modelValue];
  next[index] = { ...next[index], role_id: roleId };
  emit("update:modelValue", next);
}

function updateBonus(index: number, raw: string) {
  const n = Math.max(1, Math.min(100, Math.round(Number(raw)) || 1));
  const next = [...props.modelValue];
  next[index] = { ...next[index], bonus: n };
  emit("update:modelValue", next);
}

function removeAt(index: number) {
  emit(
    "update:modelValue",
    props.modelValue.filter((_, i) => i !== index),
  );
}

function addEmpty() {
  emit("update:modelValue", [...props.modelValue, { role_id: null, bonus: 1 }]);
}
</script>
