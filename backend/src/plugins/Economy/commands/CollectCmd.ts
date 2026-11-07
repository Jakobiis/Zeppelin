import { EmbedBuilder } from "discord.js";
import { guildPluginMessageCommand } from "vety";
import { convertDelayStringToMS } from "../../../utils.js";
import { economyUserLock } from "../../../utils/lockNameHelpers.js";
import { formatAmount } from "../functions/formatAmount.js";
import { logGameHistory } from "../functions/gameHistory.js";
import { getSpendableBalance } from "../functions/pendingBalance.js";
import { EconomyPluginType } from "../types.js";

export const CollectCmd = guildPluginMessageCommand<EconomyPluginType>()({
  trigger: ["collect"],
  permission: "can_play",

  signature: {},

  async run({ pluginData, message }) {
    const config = pluginData.config.get();
    const member = message.member!;
    const userId = message.author.id;

    const roles = Object.entries(config.collect_roles).filter(([roleId]) => member.roles.cache.has(roleId));
    if (!roles.length) {
      void pluginData.state.common.sendErrorMessage(message, "You don't have any roles that can collect.");
      return;
    }

    const emojiPrefix = config.currency_emoji ? `${config.currency_emoji} ` : "";
    const collected: string[] = [];
    const waiting: string[] = [];
    let total = 0;

    // Locked so two quick `!collect`s can't both read "off cooldown" before either logs its entry
    const lock = await pluginData.locks.acquire(economyUserLock({ id: userId }));
    try {
      const elapsed = await pluginData.state.gameHistory.getSecondsSinceLastEntry(
        userId,
        roles.map(([roleId]) => `collect:${roleId}`),
      );

      for (const [roleId, role] of roles) {
        const lastSec = elapsed.get(`collect:${roleId}`);
        const remainingMs = lastSec == null ? 0 : convertDelayStringToMS(role.cooldown)! - lastSec * 1000;
        if (remainingMs > 0) {
          waiting.push(`<@&${roleId}> ${emojiPrefix}${formatAmount(role.amount)} ready <t:${Math.ceil((Date.now() + remainingMs) / 1000)}:R>`);
          continue;
        }

        await pluginData.state.counters.changeCounterValue(config.counter_name, null, userId, role.amount);
        const balanceAfter = await pluginData.state.counters.getCounterValue(config.counter_name, null, userId);
        await logGameHistory(pluginData, {
          userId,
          gameName: `collect:${roleId}`,
          gameType: "reward",
          outcome: "win",
          betAmount: 0,
          amountChanged: role.amount,
          balanceAfter: balanceAfter ?? 0,
        });
        total += role.amount;
        collected.push(`<@&${roleId}> +${emojiPrefix}**${formatAmount(role.amount)}**`);
      }
    } finally {
      lock.unlock();
    }

    const { spendable } = await getSpendableBalance(pluginData, config.counter_name, userId);
    const sections = [
      collected.length
        ? `**Collected ${emojiPrefix}${formatAmount(total)} ${config.currency_name}**\n${collected.join("\n")}`
        : "Nothing to collect right now.",
    ];
    if (waiting.length) sections.push(`**On cooldown**\n${waiting.join("\n")}`);
    sections.push(`Balance: ${emojiPrefix}**${formatAmount(spendable)}** ${config.currency_name}`);

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(collected.length ? 0x4caf50 : 0x99aab5)
          .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
          .setTitle("Collect")
          .setDescription(sections.join("\n\n")),
      ],
      allowedMentions: { parse: [] },
    });
  },
});
