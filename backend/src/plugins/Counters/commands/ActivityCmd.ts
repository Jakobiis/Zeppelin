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
const BAR_LENGTH = 15;

interface GrantDefinition {
    triggerName: string;
    roleId: string;
    label: string;
    unlockMessage: string;
}

const GRANTS: GrantDefinition[] = [
    {
        triggerName: "grant_role",
        roleId: "1522779288523509901",
        label: "regular role",
        unlockMessage: "You met the requirement but didn't have the role — it's been added now!",
    },
    {
        triggerName: "grant_embed_perms",
        roleId: "1392677476911681647",
        label: "embed permissions",
        unlockMessage: "You met the requirement but didn't have embed permissions — they've been added now!",
    },
];

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

        const member = await pluginData.guild.members.fetch(targetUser.id).catch(() => null);

        for (const grant of GRANTS) {
            const grantTrigger = counter.triggers?.[grant.triggerName];
            const parsedGrant = grantTrigger ? parseCounterConditionString(grantTrigger.condition) : null;

            if (!parsedGrant || (parsedGrant[0] !== ">" && parsedGrant[0] !== ">=")) {
                continue;
            }

            const [grantOp, requiredPoints] = parsedGrant;
            const hasReachedGoal = evaluateCondition(grantOp, requiredPoints, finalValue);
            const percent = requiredPoints > 0 ? finalValue / requiredPoints : 1;
            const hasRole = member?.roles.cache.has(grant.roleId) ?? false;

            text += `\n\n**${grant.label}** — ${requiredPoints} points`;
            text += `\n\`${renderProgressBar(percent)}\` **${Math.floor(Math.min(percent, 1) * 100)}%**`;

            if (!hasReachedGoal) {
                const remaining = requiredPoints - finalValue;
                text += `\n-# **${remaining}** points to go`;
                text += hasRole ? `\n-# status: have it` : `\n-# status: don't have it yet`;
            } else {
                text += `\n-# requirement met`;

                if (!hasRole && member) {
                    try {
                        await member.roles.add(
                            grant.roleId,
                            `Activity threshold met but role was missing — granted via activity command`,
                        );
                        text += `\n-# status: ${grant.unlockMessage}`;
                    } catch {
                        text += `\n-# status: requirement met, but I couldn't grant this automatically — a staff member may need to check my role permissions/hierarchy`;
                    }
                } else {
                    text += `\n-# status: have it`;
                }

                const rawReverseCondition =
                    grantTrigger!.reverse_condition ||
                    buildCounterConditionString(getReverseCounterComparisonOp(grantOp), requiredPoints);
                const parsedReverse = parseCounterConditionString(rawReverseCondition);

                if (parsedReverse) {
                    const [reverseOp, reverseThreshold] = parsedReverse;
                    const pointsToLose = pointsUntilReverseTrigger(reverseOp, reverseThreshold, finalValue);

                    if (pointsToLose !== null && pointsToLose > 0) {
                        text += `\n-# lost at **${reverseThreshold}** points (**${pointsToLose}** to go)`;

                        if (counter.decay && counter.decay.amount > 0) {
                            const decayPeriodMs = convertDelayStringToMS(counter.decay.every);
                            if (decayPeriodMs) {
                                const msUntilLost = (pointsToLose * decayPeriodMs) / counter.decay.amount;
                                text += `\n-# that's about **${humanizeDuration(msUntilLost, {
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