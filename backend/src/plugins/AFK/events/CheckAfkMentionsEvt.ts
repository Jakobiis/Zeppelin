import { guildPluginEventListener } from "vety";

export const CheckAfkMentionsEvt = guildPluginEventListener({
  event: "messageCreate",
  async listener({ pluginData, args: { message: msg } }) {
    if (!msg.guild || !msg.content) return;
    if (msg.author.bot || msg.webhookId) return;

    const config = await pluginData.config.getForMessage(msg);
    if (config.ignored_channel_ids.includes(msg.channel.id)) return;

    const ownAfk = await pluginData.state.afk.getByUserId(msg.author.id);
    if (ownAfk) {
      await pluginData.state.afk.delete(msg.author.id);
      void pluginData.state.common.sendSuccessMessage(msg, "Welcome back! I've removed your AFK status.");
    }

    if (msg.mentions.users.size === 0) return;
    if (!msg.channel.isSendable()) return;

    const afkNotices: string[] = [];
    for (const userId of msg.mentions.users.keys()) {
      if (userId === msg.author.id) continue;

      const afk = await pluginData.state.afk.getByUserId(userId);
      if (afk) {
        afkNotices.push(`<@!${userId}> is AFK: ${afk.message}`);
      }
    }

    if (afkNotices.length) {
      await msg.channel.send({
        content: afkNotices.join("\n"),
        allowedMentions: { users: [] },
      });
    }
  },
});
