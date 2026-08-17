<template>
  <div class="w-full">
    <div class="flex items-center gap-2 mb-2">
      <span v-if="previewUrl" class="inline-flex w-6 h-6 shrink-0 items-center justify-center">
        <img :src="previewUrl" alt="" class="max-w-full max-h-full" />
      </span>
      <span v-else-if="modelValue" class="text-xl leading-none shrink-0">{{ modelValue }}</span>

      <input
        type="text"
        class="field-input flex-1"
        placeholder="Type a unicode emoji, or pick a server emoji below"
        :value="modelValue ?? ''"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value || null)"
      />
    </div>

    <div class="border border-border rounded-lg bg-muted/25 p-2 max-h-40 overflow-y-auto">
      <p v-if="loadError" class="text-xs text-destructive">Couldn't load this server's emoji from Discord.</p>
      <p v-else-if="loading" class="text-xs text-muted-foreground">Loading…</p>
      <p v-else-if="!emojis.length" class="text-xs text-muted-foreground">This server has no custom emoji.</p>
      <div v-else class="flex flex-wrap gap-1">
        <button
          v-for="emoji in emojis"
          :key="emoji.id"
          type="button"
          class="w-8 h-8 flex items-center justify-center rounded-md transition-colors duration-150 hover:bg-accent cursor-pointer"
          :class="isSelected(emoji) ? 'bg-accent ring-1 ring-ring/50' : ''"
          :title="emoji.name"
          @click="choose(emoji)"
        >
          <img :src="emojiImageUrl(emoji)" :alt="emoji.name" class="max-w-full max-h-full" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { DiscordEmoji, emojiImageUrl, emojiMarkdown, getGuildEmojis } from "./discordGuildData";

const props = defineProps<{
  guildId: string;
  modelValue: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string | null): void;
}>();

const emojis = ref<DiscordEmoji[]>([]);
const loading = ref(true);
const loadError = ref(false);

onMounted(async () => {
  try {
    emojis.value = await getGuildEmojis(props.guildId);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
});

function choose(emoji: DiscordEmoji) {
  emit("update:modelValue", emojiMarkdown(emoji));
}

function isSelected(emoji: DiscordEmoji): boolean {
  return props.modelValue === emojiMarkdown(emoji);
}

// Shows a live preview when the current value is a custom emoji mention (<:name:id> / <a:name:id>) — plain
// unicode emoji values fall through to the raw-character span above instead.
const previewUrl = computed(() => {
  const match = /^<a?:\w+:(\d+)>$/.exec(props.modelValue ?? "");
  if (!match) return null;
  const animated = (props.modelValue ?? "").startsWith("<a:");
  return `https://cdn.discordapp.com/emojis/${match[1]}.${animated ? "gif" : "png"}?size=32`;
});
</script>
