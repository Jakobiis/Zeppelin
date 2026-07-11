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
        label: "Regular Role",
        unlockMessage: "You met the requirement but didn't have the role — it's been added now!",
    },
    {
        triggerName: "grant_embed_perms",
        roleId: "1392677476911681647",
        label: "Embed Permissions",
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

        const member = await pluginData.guild.members.fetch(targetUser.id).catch(() => null);

        const displayName = member?.displayName ?? targetUser.displayName;
        const isSelf = targetUser.id === message.author.id;

        let text = isSelf ? `### Your Activity` : `### ${displayName}'s Activity`;

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

            text += `\n\n**${grant.label}** — ${requiredPoints} Points`;
            text += `\n\`${renderProgressBar(percent)}\` **${Math.floor(Math.min(percent, 1) * 100)}%**`;

            if (!hasReachedGoal) {
                const remaining = requiredPoints - finalValue;
                text += `\n-# **${remaining}** Points To Go`;
            } else {
                text += `\n-# Requirement Met`;

                if (!hasRole && member) {
                    try {
                        await member.roles.add(
                            grant.roleId,
                            `Activity threshold met but role was missing — granted via activity command`,
                        );
                        text += ` — ${grant.unlockMessage}`;
                    } catch {
                        text += ` — I couldn't grant this automatically, a staff member may need to check my role permissions/hierarchy`;
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
                        text += `\n-# Lost At **${reverseThreshold}** Points (**${pointsToLose}** To Go)`;

                        if (counter.decay && counter.decay.amount > 0) {
                            const decayPeriodMs = convertDelayStringToMS(counter.decay.every);
                            if (decayPeriodMs) {
                                const msUntilLost = (pointsToLose * decayPeriodMs) / counter.decay.amount;
                                text += `\n-# That's About **${humanizeDuration(msUntilLost, {
                                    round: true,
                                })}** Away If You Stay Inactive`;
                            }
                        }
                    }
                }
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x0159b2)
            .setDescription(text)
            .setThumbnail(member?.displayAvatarURL() ?? targetUser.displayAvatarURL())
            .setFooter({ text: `Points: ${finalValue}` });

        await message.channel.send({ embeds: [embed] });
    },
});