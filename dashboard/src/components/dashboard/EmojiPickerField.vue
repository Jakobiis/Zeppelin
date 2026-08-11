<template>
  <div>
    <div class="flex items-center gap-2">
      <span v-if="previewUrl" class="inline-flex w-6 h-6 shrink-0 items-center justify-center">
        <img :src="previewUrl" alt="" class="max-w-full max-h-full" />
      </span>
      <span v-else-if="modelValue" class="text-xl leading-none shrink-0">{{ modelValue }}</span>

      <input
        type="text"
        class="flex-1 bg-input border border-border rounded-md px-2 py-1"
        placeholder="Type an emoji, or pick a server emoji"
        :value="modelValue ?? ''"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value || null)"
      />
      <button type="button" class="btn-sm btn-secondary shrink-0" @click="open = !open">
        {{ open ? "Close" : "Pick" }}
      </button>
    </div>

    <div v-if="open" class="mt-2 border border-border rounded-lg p-2 max-h-48 overflow-y-auto">
      <p v-if="loadError" class="text-xs text-destructive">Couldn't load this server's emoji from Discord.</p>
      <p v-else-if="loading" class="text-xs text-muted-foreground">Loading…</p>
      <p v-else-if="!emojis.length" class="text-xs text-muted-foreground">This server has no custom emoji.</p>
      <div v-else class="flex flex-wrap gap-1">
        <button
          v-for="emoji in emojis"
          :key="emoji.id"
          type="button"
          class="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent"
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
import { computed, ref, watch } from "vue";
import { DiscordEmoji, emojiImageUrl, emojiMarkdown, getGuildEmojis } from "./discordGuildData";

const props = defineProps<{
  guildId: string;
  modelValue: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string | null): void;
}>();

const open = ref(false);
const emojis = ref<DiscordEmoji[]>([]);
const loading = ref(false);
const loadError = ref(false);
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  loading.value = true;
  try {
    emojis.value = await getGuildEmojis(props.guildId);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

watch(open, (isOpen) => {
  if (isOpen) void ensureLoaded();
});

function choose(emoji: DiscordEmoji) {
  emit("update:modelValue", emojiMarkdown(emoji));
  open.value = false;
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
