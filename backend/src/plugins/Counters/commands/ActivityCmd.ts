import { guildPluginMessageCommand } from "vety";
import { EmbedBuilder } from "discord.js";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import {
    TriggerComparisonOp,
    buildCounterConditionString,
    getReverseCounterComparisonOp,
    parseCounterConditionString,
} from "../../../data/entities/CounterTrigger.js";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { convertDelayStringToMS } from "../../../utils.js";
import { CountersPluginType } from "../types.js";

const ACTIVITY_COUNTER_NAME = "activity";
const GRANT_TRIGGER_NAME = "grant_role";
const BAR_LENGTH = 15;

// Must match automod.rules.grant_activity_role.actions.add_roles in the config
const GRANT_ROLE_ID = "1522779288523509901";

function evaluateCondition(op: TriggerComparisonOp, threshold: number, value: number): boolean {
    switch (op) {
        case "=":
            return value === threshold;
        case "!=":
            return value !== threshold;
        case ">":
            return value > threshold;
        case "<":
            return value < threshold;
        case ">=":
            return value >= threshold;
        case "<=":
            return value <= threshold;
    }
}

function pointsUntilReverseTrigger(op: TriggerComparisonOp, threshold: number, value: number): number | null {
    if (op === "<") return value - threshold + 1;
    if (op === "<=") return value - threshold;
    return null;
}

function renderProgressBar(percent: number): string {
    const clamped = Math.max(0, Math.min(1, percent));
    const filled = Math.round(clamped * BAR_LENGTH);
    return "█".repeat(filled) + "░".repeat(BAR_LENGTH - filled);
}

export const ActivityCmd = guildPluginMessageCommand<CountersPluginType>()({
    trigger: ["activity", "points"],
    permission: "can_view",
    signature: {
        user: ct.resolvedUser({ required: false }),
    },
    async run({ pluginData, message, args }) {
        const config = await pluginData.config.getForMessage(message);
        const counter = config.counters[ACTIVITY_COUNTER_NAME];
        const counterId = pluginData.state.counterIds[ACTIVITY_COUNTER_NAME];

        if (!counter || !counterId) {
            void pluginData.state.common.sendErrorMessage(
                message,
                `The "${ACTIVITY_COUNTER_NAME}" counter isn't configured on this server.`,
            );
            return;
        }

        const targetUser = args.user ?? message.author;
        const value = await pluginData.state.counters.getCurrentValue(counterId, null, targetUser.id);
        const finalValue = value ?? counter.initial_value ?? 0;

        const who = targetUser.id === message.author.id ? "You currently have" : `<@!${targetUser.id}> currently has`;

        let text = `${who} **${finalValue}** activity points.`;

        const grantTrigger = counter.triggers?.[GRANT_TRIGGER_NAME];
        const parsedGrant = grantTrigger ? parseCounterConditionString(grantTrigger.condition) : null;

        if (parsedGrant && (parsedGrant[0] === ">" || parsedGrant[0] === ">=")) {
            const [grantOp, requiredPoints] = parsedGrant;
            const hasReachedGoal = evaluateCondition(grantOp, requiredPoints, finalValue);
            const percent = requiredPoints > 0 ? finalValue / requiredPoints : 1;

            text += `\n\`${renderProgressBar(percent)}\` **${Math.floor(Math.min(percent, 1) * 100)}%**`;

            if (!hasReachedGoal) {
                const remaining = requiredPoints - finalValue;
                text += `\n-# **${requiredPoints}** needed for the role — **${remaining}** to go`;
            } else {
                text += `\n-# role requirement of **${requiredPoints}** met`;

                const member = await pluginData.guild.members.fetch(targetUser.id).catch(() => null);
                if (member && !member.roles.cache.has(GRANT_ROLE_ID)) {
                    try {
                        await member.roles.add(
                            GRANT_ROLE_ID,
                            "Activity threshold met but role was missing — granted via ;activity command",
                        );
                        text += `\nYou met the requirement but didn't have the role — it's been added now!`;
                    } catch {
                        text += `\nYou've met the requirement, but I couldn't grant the role automatically. A staff member may need to check my role permissions.`;
                    }
                }

                const rawReverseCondition =
                    grantTrigger!.reverse_condition ||
                    buildCounterConditionString(getReverseCounterComparisonOp(grantOp), requiredPoints);
                const parsedReverse = parseCounterConditionString(rawReverseCondition);

                if (parsedReverse) {
                    const [reverseOp, reverseThreshold] = parsedReverse;
                    const pointsToLose = pointsUntilReverseTrigger(reverseOp, reverseThreshold, finalValue);

                    if (pointsToLose !== null && pointsToLose > 0) {
                        text += `\n-#You'll lose the role at **${reverseThreshold}** points (**${pointsToLose}** to go)`;

                        if (counter.decay && counter.decay.amount > 0) {
                            const decayPeriodMs = convertDelayStringToMS(counter.decay.every);
                            if (decayPeriodMs) {
                                const msUntilLost = (pointsToLose * decayPeriodMs) / counter.decay.amount;
                                text += `\n-# That's about **${humanizeDuration(msUntilLost, {
                                    round: true,
                                })}** away if you stay inactive`;
                            }
                        }
                    }
                }
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x0159b2)
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .setDescription(text);

        await message.channel.send({ embeds: [embed] });
    },
});