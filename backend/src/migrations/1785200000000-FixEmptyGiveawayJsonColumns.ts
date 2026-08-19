import { MigrationInterface, QueryRunner } from "typeorm";

// 1785100000000-AddThreadIdToGiveaways added 5 NOT NULL text (simple-json) columns to a table that could
// already have rows, with no default — MySQL backfilled existing rows with '' for each, which isn't valid
// JSON, so TypeORM's simple-json parser (JSON.parse) throws "Unexpected end of JSON input" reading them back.
// This just fixes the bad data; it doesn't change the schema.
export class FixEmptyGiveawayJsonColumns1785200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`UPDATE giveaways SET winner_thread_ids = '{}' WHERE winner_thread_ids = '' OR winner_thread_ids IS NULL`);
    await queryRunner.query(`UPDATE giveaways SET claimed_winner_ids = '[]' WHERE claimed_winner_ids = '' OR claimed_winner_ids IS NULL`);
    await queryRunner.query(`UPDATE giveaways SET expired_winner_ids = '[]' WHERE expired_winner_ids = '' OR expired_winner_ids IS NULL`);
    await queryRunner.query(`UPDATE giveaways SET winner_claim_deadlines = '{}' WHERE winner_claim_deadlines = '' OR winner_claim_deadlines IS NULL`);
  }

  public async down(): Promise<any> {
    // Data-fixing migration only — nothing meaningful to revert to.
  }
}
