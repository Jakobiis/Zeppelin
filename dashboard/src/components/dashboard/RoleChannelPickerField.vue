<template>
  <ComboboxField
    v-if="!loadError"
    :options="options"
    :model-value="modelValue"
    :placeholder="loading ? 'Loading…' : `— Select a ${entityType} —`"
    @update:model-value="(val) => $emit('update:modelValue', val == null ? null : String(val))"
  />
  <div v-else>
    <p class="text-xs text-destructive mb-1">Couldn't load {{ entityType }}s from Discord — enter an ID manually.</p>
    <input
      type="text"
      class="field-input font-mono text-sm"
      :value="modelValue ?? ''"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value || null)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import ComboboxField, { ComboboxOption } from "./ComboboxField.vue";
import { channelTypeLabel, DiscordChannel, DiscordRole, getGuildChannels, getGuildRoles } from "./discordGuildData";

const props = defineProps<{
  guildId: string;
  entityType: "role" | "channel";
  modelValue: string | null;
}>();

defineEmits<{
  (e: "update:modelValue", value: string | null): void;
}>();

const items = ref<(DiscordRole | DiscordChannel)[]>([]);
const loading = ref(true);
const loadError = ref(false);

const currentUnknown = computed(
  () => !!props.modelValue && !loading.value && !items.value.some((i) => i.id === props.modelValue),
);

function optionLabel(item: DiscordRole | DiscordChannel): string {
  if (props.entityType === "channel") {
    const c = item as DiscordChannel;
    return `#${c.name} (${channelTypeLabel(c.type)})`;
  }
  return (item as DiscordRole).name;
}

const options = computed<ComboboxOption[]>(() => {
  const mapped = items.value.map((item) => ({ value: item.id, label: optionLabel(item) }));
  if (currentUnknown.value) {
    mapped.unshift({ value: props.modelValue!, label: `Unknown ${props.entityType} (${props.modelValue})` });
  }
  return mapped;
});

onMounted(async () => {
  try {
    items.value = props.entityType === "role" ? await getGuildRoles(props.guildId) : await getGuildChannels(props.guildId);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
});
</script>
