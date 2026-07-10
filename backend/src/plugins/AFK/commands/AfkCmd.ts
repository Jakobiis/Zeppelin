import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import { getRoleMentions, getUserMentions } from "../../../utils.js";
import { afkCmd } from "../types.js";

const everyoneOrHereRegex = /@(everyone|here)/;

export const AfkCmd = afkCmd({
  trigger: "afk",
  usage: "!afk Be right back",
  permission: "can_use",

  signature: {
    message: ct.string({ catchAll: true }),
  },

  async run({ message: msg, args, pluginData }) {
    if (getUserMentions(args.message).length || getRoleMentions(args.message).length || everyoneOrHereRegex.test(args.message)) {
      void pluginData.state.common.sendErrorMessage(msg, "Your AFK message cannot contain mentions");
      return;
    }

    await pluginData.state.afk.set(msg.author.id, args.message);

    void pluginData.state.common.sendSuccessMessage(msg, `You are now AFK: ${args.message}`);
  },
});
