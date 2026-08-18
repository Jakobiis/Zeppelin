<template>
  <div class="w-full relative" ref="rootEl">
    <div class="flex items-center gap-2">
      <span v-if="previewUrl" class="inline-flex w-6 h-6 shrink-0 items-center justify-center">
        <img :src="previewUrl" alt="" class="max-w-full max-h-full" />
      </span>
      <span v-else-if="modelValue" class="text-xl leading-none shrink-0">{{ modelValue }}</span>

      <input
        type="text"
        class="field-input flex-1"
        placeholder="Type a unicode emoji, or click to browse server emoji"
        :value="modelValue ?? ''"
        @focus="open = true"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value || null)"
      />
    </div>

    <div
      v-if="open"
      class="absolute z-20 left-0 right-0 mt-1 border border-border rounded-lg bg-popover shadow-lg p-2 max-h-48 overflow-y-auto"
    >
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
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
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

// The emoji grid is a popover, not always-on-screen — every emoji field on a form (there can be several) would
// otherwise show its full emoji list at once, which is exactly the "raw"/cluttered look this replaces.
const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

function onDocumentMouseDown(ev: MouseEvent) {
  if (open.value && rootEl.value && !rootEl.value.contains(ev.target as Node)) {
    open.value = false;
  }
}

onMounted(async () => {
  document.addEventListener("mousedown", onDocumentMouseDown);
  try {
    emojis.value = await getGuildEmojis(props.guildId);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocumentMouseDown);
});

function choose(emoji: DiscordEmoji) {
  emit("update:modelValue", emojiMarkdown(emoji));
  open.value = false;
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
