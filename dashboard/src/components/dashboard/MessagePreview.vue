<template>
  <div class="rounded-lg p-4 max-w-lg overflow-x-auto" style="background-color: #313338">
    <div class="flex items-start gap-3">
      <img src="/img/logo.png" alt="" class="w-10 h-10 rounded-full shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-1.5 flex-wrap">
          <span class="font-medium text-sm" style="color: #f2f3f5">Zeppelin</span>
          <span class="text-[10px] font-medium leading-4 px-1 rounded" style="background-color: #5865f2; color: white">BOT</span>
          <span class="text-xs" style="color: #949ba4">Today at 12:00 PM</span>
        </div>

        <div v-if="!contentText && !embeds.length" class="text-sm italic mt-0.5" style="color: #949ba4">
          Nothing to preview yet.
        </div>

        <div
          v-if="contentText"
          class="text-sm whitespace-pre-wrap break-words mt-0.5"
          style="color: #dbdee1"
          v-html="renderMarkdown(contentText)"
        ></div>

        <div
          v-for="(embed, i) in embeds"
          :key="i"
          class="mt-2 rounded border-l-4 pl-3 pr-4 py-2 max-w-md"
          style="background-color: #2b2d31"
          :style="{ borderColor: embedColor(embed.color) }"
        >
          <div v-if="embed.author?.name" class="flex items-center gap-1.5 mb-1.5 text-sm font-medium" style="color: #f2f3f5">
            <img v-if="embed.author.icon_url" :src="embed.author.icon_url" class="w-5 h-5 rounded-full" alt="" />
            {{ embed.author.name }}
          </div>

          <a
            v-if="embed.title && embed.url"
            :href="embed.url"
            target="_blank"
            rel="noopener noreferrer"
            class="block font-semibold mb-1 hover:underline"
            style="color: #00a8fc"
          >{{ embed.title }}</a>
          <div v-else-if="embed.title" class="font-semibold mb-1" style="color: #f2f3f5">{{ embed.title }}</div>

          <div
            v-if="embed.description"
            class="text-sm whitespace-pre-wrap break-words"
            style="color: #dbdee1"
            v-html="renderMarkdown(embed.description)"
          ></div>

          <div v-if="embed.fields?.length" class="grid grid-cols-3 gap-x-3 gap-y-1.5 mt-2">
            <div v-for="(field, fi) in embed.fields" :key="fi" :class="field.inline ? '' : 'col-span-3'">
              <div class="text-sm font-semibold" style="color: #f2f3f5">{{ field.name }}</div>
              <div class="text-sm whitespace-pre-wrap break-words" style="color: #dbdee1">{{ field.value }}</div>
            </div>
          </div>

          <img
            v-if="embed.thumbnail?.url"
            :src="embed.thumbnail.url"
            class="w-16 h-16 object-cover rounded float-right mt-1"
            alt=""
          />
          <img
            v-if="embed.image?.url"
            :src="embed.image.url"
            class="rounded max-w-full mt-2"
            alt=""
          />

          <div
            v-if="embed.footer?.text"
            class="flex items-center gap-1.5 mt-2 text-xs clear-both"
            style="color: #949ba4"
          >
            <img v-if="embed.footer.icon_url" :src="embed.footer.icon_url" class="w-4 h-4 rounded-full" alt="" />
            {{ embed.footer.text }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface EmbedField {
  name?: string;
  value?: string;
  inline?: boolean;
}

interface EmbedInput {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: { name?: string; icon_url?: string };
  footer?: { text?: string; icon_url?: string };
  image?: { url?: string };
  thumbnail?: { url?: string };
  fields?: EmbedField[];
}

interface StructuredMessage {
  content?: string;
  tts?: boolean;
  embeds?: EmbedInput | EmbedInput[];
  embed?: EmbedInput;
}

const props = defineProps<{
  // Zeppelin's message-content shape: a plain string, or { content?, tts?, embeds?/embed? }.
  value: string | StructuredMessage | null | undefined;
}>();

const contentText = computed(() => {
  if (typeof props.value === "string") return props.value;
  return props.value?.content ?? "";
});

const embeds = computed<EmbedInput[]>(() => {
  if (typeof props.value !== "object" || props.value == null) return [];
  const raw = props.value.embeds ?? props.value.embed;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
});

const DEFAULT_EMBED_COLOR = "#1e1f22";

function embedColor(color: number | undefined): string {
  if (color == null) return DEFAULT_EMBED_COLOR;
  return `#${Math.max(0, Math.min(0xffffff, color)).toString(16).padStart(6, "0")}`;
}

// Deliberately minimal — just enough Discord markdown to make a preview recognizable, not a full parser. HTML is
// escaped first so pasted content can't inject markup even though this is an admin-only, client-side-only view.
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/```([\s\S]*?)```/g, (_m, code: string) => `<code class="block rounded px-1.5 py-1 my-1 whitespace-pre-wrap" style="background-color:#1e1f22">${code}</code>`);
  html = html.replace(/`([^`\n]+)`/g, '<code class="rounded px-1 py-0.5" style="background-color:#1e1f22">$1</code>');
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  html = html.replace(/^&gt;\s?(.*)$/gm, '<span class="block border-l-2 pl-2" style="border-color:#4e5058;color:#949ba4">$1</span>');
  html = html.replace(/\n/g, "<br>");
  return html;
}
</script>
