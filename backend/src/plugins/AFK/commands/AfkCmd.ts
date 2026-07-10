import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { getRoleMentions, getUserMentions } from "../../../utils.js";
import { afkCmd } from "../types.js";
import { buildAfkNickname } from "../util/afkNickname.js";

const everyoneOrHereRegex = /@(everyone|here)/;

export const AfkCmd = afkCmd({
  trigger: "afk",
  usage: "!afk Be right back",
  permission: "can_use",

  signature: {
    message: ct.string({ catchAll: true, required: false }),
  },

  async run({ message: msg, args, pluginData }) {
    const afkMessage = args.message || "AFK";

    if (getUserMentions(afkMessage).length || getRoleMentions(afkMessage).length || everyoneOrHereRegex.test(afkMessage)) {
      void pluginData.state.common.sendErrorMessage(msg, "Your AFK message cannot contain mentions");
      return;
    }

    const config = await pluginData.config.getForMessage(msg);
    const existingAfk = await pluginData.state.afk.getByUserId(msg.author.id);

    // If they're already AFK, keep the nickname we originally saved rather than
    // re-reading their current (already-prefixed) nickname
    const previousNickname = existingAfk ? existingAfk.previous_nickname : (msg.member?.nickname ?? null);

    if (config.afk_rename && msg.member) {
      const newNickname = buildAfkNickname(previousNickname ?? msg.member.user.username);
      if (msg.member.nickname !== newNickname) {
        await msg.member.setNickname(newNickname).catch(() => null);
      }
    }

    await pluginData.state.afk.set(msg.author.id, afkMessage, previousNickname);

    void pluginData.state.common.sendSuccessMessage(msg, `You are now AFK: ${afkMessage}`);
  },
});
