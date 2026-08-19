import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";

// The dashboard's guild-wide Economy analytics/transaction feed (api/guilds/economy.ts) query this table without
// a user_id filter — the two existing indices (guild_id+user_id+created_at, guild_id+game_name+created_at) don't
// serve that access pattern well, so this adds one that does.
export class AddGuildDateIndexToEconomyGameHistory1785700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.createIndex(
      "economy_game_history",
      new TableIndex({
        name: "IDX_economy_game_history_guild_created",
        columnNames: ["guild_id", "created_at"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropIndex("economy_game_history", "IDX_economy_game_history_guild_created");
  }
}
