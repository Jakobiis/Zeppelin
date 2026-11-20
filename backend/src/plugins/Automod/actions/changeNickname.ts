import { z } from "zod";
import { nonNullish, unique, zBoundedCharacters } from "../../../utils.js";
import { LogsPlugin } from "../../Logs/LogsPlugin.js";
import { RECENT_NICKNAME_CHANGE_EXPIRY_TIME } from "../constants.js";
import { automodAction } from "../helpers.js";

export const ChangeNicknameAction = automodAction({
  configSchema: z.union([
    zBoundedCharacters(0, 32),
    z.strictObject({
      name: zBoundedCharacters(0, 32),
    }),
  ]),

  async apply({ pluginData, contexts, actionConfig }) {
    const members = unique(contexts.map((c) => c.member).filter(nonNullish));

    for (const member of members) {
      const recent = pluginData.state.recentNicknameChanges.get(member.id);
      if (recent && Date.now() - recent.timestamp < RECENT_NICKNAME_CHANGE_EXPIRY_TIME) continue;
      const newName = typeof actionConfig === "string" ? actionConfig : actionConfig.name;
      // Already correct: skip, so the cooldown below only starts on a real change (otherwise e.g. an any_message
      // rule with "" would put members on cooldown on every message and miss a nickname set right after)
      if ((member.nickname ?? "") === newName) continue;

      member.edit({ nick: newName }).catch(() => {
        pluginData.getPlugin(LogsPlugin).logBotAlert({
          body: `Failed to change the nickname of \`${member.id}\``,
        });
      });

      pluginData.state.recentNicknameChanges.set(member.id, { timestamp: Date.now() });
    }
  },
});
