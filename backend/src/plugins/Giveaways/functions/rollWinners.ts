import { GiveawayEntries } from "../../../data/GiveawayEntries.js";

const giveawayEntries = new GiveawayEntries();

/**
 * Weighted random selection without replacement. Each pick re-rolls over the *remaining* pool's total weight,
 * so earlier picks don't skew the odds for later ones. Returns fewer than `winnerCount` user IDs if there
 * aren't enough eligible entrants.
 */
export async function rollWinners(giveawayId: number, winnerCount: number, excludeUserIds: string[] = []): Promise<string[]> {
  const entries = (await giveawayEntries.getForGiveaway(giveawayId)).filter((entry) => !excludeUserIds.includes(entry.user_id));

  const remaining = entries.slice();
  const winners: string[] = [];
  const pickCount = Math.min(winnerCount, remaining.length);

  for (let i = 0; i < pickCount; i++) {
    const totalWeight = remaining.reduce((sum, entry) => sum + entry.entries, 0);
    let roll = Math.random() * totalWeight;
    let pickedIndex = remaining.length - 1;

    for (let j = 0; j < remaining.length; j++) {
      roll -= remaining[j].entries;
      if (roll <= 0) {
        pickedIndex = j;
        break;
      }
    }

    winners.push(remaining[pickedIndex].user_id);
    remaining.splice(pickedIndex, 1);
  }

  return winners;
}
