import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("economy_game_history")
export class EconomyGameHistoryEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column() guild_id: string;

  @Column() user_id: string;

  // The `economy.games` config key this entry was played under
  @Column() game_name: string;

  // wager | reward | blackjack | pvp
  @Column() game_type: string;

  // win | loss | push
  @Column() outcome: string;

  @Column() bet_amount: number;

  // Signed net change to the player's balance from this entry (positive = gained, negative = lost)
  @Column() amount_changed: number;

  @Column() balance_after: number;

  // The opposing player's user ID for PvP entries, or the literal "bot" when played against the bot. Null for
  // non-PvP game types.
  @Column({ type: String, nullable: true })
  opponent_id: string | null;

  @Column() created_at: string;
}
