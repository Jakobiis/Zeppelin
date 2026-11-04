import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
  OmitPartialGroupDMChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { GuildPluginData } from "vety";
import { noop } from "../../../utils.js";
import { getGuildPrefix } from "../../../utils/getGuildPrefix.js";
import { EconomyPluginType } from "../types.js";

const PANEL_TIMEOUT = 10 * 60 * 1000;
const BUTTONS_PER_ROW = 5;

/**
 * `!play` with no arguments: an embed with a button per game. Clicking one asks for a bet in a modal, then
 * re-dispatches `!play <game> <bet>` as that user, so the game runs exactly as if they'd typed it.
 */
export async function sendPlayPanel(
  pluginData: GuildPluginData<EconomyPluginType>,
  message: OmitPartialGroupDMChannel<Message>,
) {
  const config = pluginData.config.get();
  const prefix = getGuildPrefix(pluginData);
  const games = Object.entries(config.games).filter(([, game]) => game.type !== "reward");

  if (!games.length) {
    void pluginData.state.common.sendErrorMessage(message, "No games are configured on this server.");
    return;
  }

  const idBase = `playPanel:${message.id}`;
  const buildRows = (disabled = false) => {
    const rows: Array<ActionRowBuilder<ButtonBuilder>> = [];
    games.forEach(([name, game], i) => {
      if (i % BUTTONS_PER_ROW === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
      const button = new ButtonBuilder()
        .setCustomId(`${idBase}:${name}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel(game.label ?? name)
        .setDisabled(disabled);
      if (game.emoji) button.setEmoji(game.emoji);
      rows.at(-1)!.addComponents(button);
    });
    return rows;
  };

  const lines = games.map(
    ([name, game]) => `${game.emoji ? `${game.emoji} ` : ""}**${game.label ?? name}**: \`${prefix}${name} <bet>\``,
  );
  const embed = new EmbedBuilder()
    .setColor(0x0159b2)
    .setTitle("Pick a game")
    .setDescription(`${lines.join("\n")}\n\nSee \`${prefix}games\` for odds and options.`);

  const panel = await message.channel.send({ embeds: [embed], components: buildRows() });

  const collector = panel.createMessageComponentCollector({
    time: PANEL_TIMEOUT,
    filter: (i) => i.customId.startsWith(`${idBase}:`),
  });

  collector.on("collect", async (interaction) => {
    const gameName = interaction.customId.slice(idBase.length + 1);
    const game = pluginData.config.get().games[gameName];
    if (!game) return;

    const modalId = `${idBase}:bet:${interaction.id}`;
    const betHint = "min_bet" in game ? ` (${game.min_bet}-${game.max_bet}, or "all")` : "";
    await interaction
      .showModal(
        new ModalBuilder()
          .setCustomId(modalId)
          .setTitle((game.label ?? gameName).slice(0, 45))
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("amount")
                .setLabel(`Your bet${betHint}`.slice(0, 45))
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
          ),
      )
      .catch(noop);

    const submit = await interaction
      .awaitModalSubmit({ time: PANEL_TIMEOUT, filter: (s) => s.customId === modalId })
      .catch(() => null);
    if (!submit) return;
    await submit.deferUpdate().catch(noop);

    const amount = submit.fields.getTextInputValue("amount").trim().split(/\s/, 1)[0];
    // A copy of the original `!play` message, re-authored as the clicker. A fresh id keeps per-game
    // button ids unique when several people start games from the same panel.
    const copy = Object.create(message) as Message;
    copy.content = `${prefix}play ${gameName} ${amount}`;
    copy.author = submit.user;
    copy.id = submit.id;
    await pluginData.getVetyInstance().dispatchMessageCommands(copy);
  });

  collector.on("end", () => {
    panel.edit({ components: buildRows(true) }).catch(noop);
  });
}
