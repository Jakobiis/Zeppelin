import { GuildPluginData, guildPluginMessageCommand } from "vety";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    GuildMember,
    Message,
    MessageComponentInteraction,
    OmitPartialGroupDMChannel,
    Snowflake,
} from "discord.js";
import { z } from "zod";
import { commandTypeHelpers as ct } from "../../../commandTypes.js";
import {
    TriggerComparisonOp,
    buildCounterConditionString,
    getReverseCounterComparisonOp,
    parseCounterConditionString,
} from "../../../data/entities/CounterTrigger.js";
import { humanizeDuration } from "../../../humanizeDuration.js";
import { MINUTES, convertDelayStringToMS, noop } from "../../../utils.js";
import { CountersPluginType, zCounter } from "../types.js";

const ACTIVITY_COUNTER_NAME = "activity";
// The Automod rule that feeds the activity counter — there's no formal link between the two, this is just
// this server's naming convention (see zeppelin config: automod.rules.accumulate_activity).
const ACTIVITY_AUTOMOD_RULE_NAME = "accumulate_activity";
const BAR_LENGTH = 15;
const INFO_BUTTON_TIMEOUT = 5 * MINUTES;

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

/**
 * Mirrors the "first matching role override wins" logic that decayCounter.ts uses for the actual decay job,
 * so the estimate shown here matches the rate that will actually be applied to this member.
 */
function getEffectiveDecayRate(
    decay: NonNullable<z.infer<typeof zCounter>["decay"]>,
    member: GuildMember | null,
): { amount: number; every: string } {
    if (member) {
        const override = decay.role_overrides.find((o) => member.roles.cache.has(o.role as Snowflake));
        if (override) {
            return override;
        }
    }

    return decay;
}

function buildDecayInfoLines(
    pluginData: GuildPluginData<CountersPluginType>,
    decay: NonNullable<z.infer<typeof zCounter>["decay"]>,
): string[] {
    const lines: string[] = [];

    const basePeriodMs = convertDelayStringToMS(decay.every);
    lines.push(`- Base rate: **${decay.amount}** points every ${humanizeDuration(basePeriodMs ?? 0)}`);

    for (const override of decay.role_overrides) {
        const roleName = pluginData.guild.roles.cache.get(override.role as Snowflake)?.name ?? "Unknown role";
        const overridePeriodMs = convertDelayStringToMS(override.every);
        lines.push(`- **${roleName}**: **${override.amount}** points every ${humanizeDuration(overridePeriodMs ?? 0)}`);
    }

    return lines;
}

function buildRewardInfoLines(counter: z.infer<typeof zCounter>): string[] {
    const lines: string[] = [];

    for (const grant of GRANTS) {
        const grantTrigger = counter.triggers?.[grant.triggerName];
        const parsedGrant = grantTrigger ? parseCounterConditionString(grantTrigger.condition) : null;
        if (!parsedGrant || (parsedGrant[0] !== ">" && parsedGrant[0] !== ">=")) {
            continue;
        }

        const [grantOp, requiredPoints] = parsedGrant;
        let line = `**${grant.label}** — ${requiredPoints} points`;

        const rawReverseCondition =
            grantTrigger!.reverse_condition ||
            buildCounterConditionString(getReverseCounterComparisonOp(grantOp), requiredPoints);
        const parsedReverse = parseCounterConditionString(rawReverseCondition);
        if (parsedReverse) {
            line += ` (removed below ${parsedReverse[1]})`;
        }

        lines.push(line);
    }

    return lines;
}

async function buildEarningInfoLines(
    pluginData: GuildPluginData<CountersPluginType>,
    message: OmitPartialGroupDMChannel<Message>,
): Promise<string[]> {
    const lines: string[] = [];

    try {
        const { AutomodPlugin } = await import("../../Automod/AutomodPlugin.js");
        if (!pluginData.hasPlugin(AutomodPlugin)) {
            return lines;
        }

        const rule = await pluginData
            .getPlugin(AutomodPlugin)
            .getRuleConfigForMessage(ACTIVITY_AUTOMOD_RULE_NAME, message);
        const addToCounter = rule?.actions?.add_to_counter;

        if (!rule || !rule.enabled || !addToCounter || addToCounter.counter !== ACTIVITY_COUNTER_NAME) {
            return lines;
        }

        const cooldownMs = rule.cooldown ? convertDelayStringToMS(rule.cooldown) : null;
        const cooldownText = cooldownMs ? ` (${humanizeDuration(cooldownMs)} cooldown)` : "";
        const pointWord = addToCounter.amount === 1 ? "point" : "points";
        lines.push(`+**${addToCounter.amount}** ${pointWord} per qualifying message${cooldownText}`);

        if (addToCounter.schedules?.length) {
            const { SchedulePlugin } = await import("../../Schedule/SchedulePlugin.js");
            if (pluginData.hasPlugin(SchedulePlugin)) {
                const schedulePlugin = pluginData.getPlugin(SchedulePlugin);
                for (const scheduleName of addToCounter.schedules) {
                    const info = schedulePlugin.getScheduleInfo(scheduleName);
                    if (!info) continue;

                    if (info.active) {
                        const untilText = info.activeUntil
                            ? ` (ends <t:${Math.floor(info.activeUntil / 1000)}:R>)`
                            : "";
                        lines.push(`**${info.multiplier}x** boost is currently **active**${untilText}!`);
                    } else {
                        lines.push(`**${info.multiplier}x** boost (\`${scheduleName}\`) isn't currently active.`);
                    }
                }
            }
        }
    } catch {
    }

    return lines;
}

async function buildActivityInfoEmbed(
    pluginData: GuildPluginData<CountersPluginType>,
    message: OmitPartialGroupDMChannel<Message>,
    counter: z.infer<typeof zCounter>,
): Promise<EmbedBuilder> {
    const sections: string[] = [
        "Activity points measure how active you are in the server. Send qualifying messages to earn points, but they'll decay over time if you go inactive — build up enough and you'll unlock roles/perks, but let them drop too low and those get taken away again.",
    ];

    const earningLines = await buildEarningInfoLines(pluginData, message);
    if (earningLines.length) {
        sections.push(`**Earning Points**\n${earningLines.join("\n")}`);
    }

    if (counter.decay) {
        const decayLines = buildDecayInfoLines(pluginData, counter.decay);
        sections.push(`**Losing Points**\n${decayLines.join("\n")}`);
    }

    const rewardLines = buildRewardInfoLines(counter);
    if (rewardLines.length) {
        sections.push(`**Rewards**\n${rewardLines.join("\n")}`);
    }

    return new EmbedBuilder()
        .setColor(0x0159b2)
        .setTitle("How Activity Works")
        .setDescription(sections.join("\n\n"));
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

                        if (counter.decay) {
                            const effectiveDecay = getEffectiveDecayRate(counter.decay, member);
                            const decayPeriodMs = convertDelayStringToMS(effectiveDecay.every);
                            if (effectiveDecay.amount > 0 && decayPeriodMs) {
                                const msUntilLost = (pointsToLose * decayPeriodMs) / effectiveDecay.amount;
                                text += `\n-# That's About **${humanizeDuration(msUntilLost, {
                                    round: true,
                                    largest: 2,
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

        const infoCustomId = `activityInfo:${message.id}`;
        const infoRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("❔")
                .setLabel("How It Works")
                .setCustomId(infoCustomId),
        );

        const sentMessage = await message.channel.send({ embeds: [embed], components: [infoRow] });

        const collector = sentMessage.createMessageComponentCollector({
            time: INFO_BUTTON_TIMEOUT,
            filter: (interaction) => interaction.customId === infoCustomId,
        });

        collector.on("collect", async (interaction: MessageComponentInteraction) => {
            if (interaction.user.id !== message.author.id) {
                await interaction
                    .reply({ content: "You are not permitted to use this button.", ephemeral: true })
                    .catch(noop);
                return;
            }

            const infoEmbed = await buildActivityInfoEmbed(pluginData, message, counter);
            await interaction.reply({ embeds: [infoEmbed], ephemeral: true }).catch(noop);
        });

        collector.on("end", () => {
            sentMessage.edit({ components: [] }).catch(noop);
        });
    },
});
