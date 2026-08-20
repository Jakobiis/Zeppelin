<template>
  <div class="field-panel space-y-2">
    <div v-if="!modelValue.length" class="text-sm text-muted-foreground italic">None</div>
    <div v-for="(roleId, index) in modelValue" :key="index" class="row-item">
      <RoleChannelPickerField
        class="flex-1"
        :guild-id="guildId"
        entity-type="role"
        :model-value="roleId"
        @update:model-value="(val) => updateAt(index, val)"
      />
      <button type="button" class="btn-remove btn-remove-icon shrink-0" aria-label="Remove" @click="removeAt(index)">
        <Close :size="16" fillColor="currentColor" style="font-size: 16px" />
      </button>
    </div>
    <button type="button" class="btn-add" @click="addEmpty">+ Add role</button>
  </div>
</template>

<script setup lang="ts">
import Close from "vue-material-design-icons/Close.vue";
import RoleChannelPickerField from "./RoleChannelPickerField.vue";

const props = defineProps<{
  guildId: string;
  modelValue: (string | null)[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: (string | null)[]): void;
}>();

function updateAt(index: number, val: string | null) {
  const next = [...props.modelValue];
  next[index] = val;
  emit("update:modelValue", next);
}

function removeAt(index: number) {
  emit(
    "update:modelValue",
    props.modelValue.filter((_, i) => i !== index),
  );
}

function addEmpty() {
  emit("update:modelValue", [...props.modelValue, null]);
}
</script>
