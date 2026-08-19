import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddWinnerThreadClosedIdsToGiveaways1785600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.addColumn(
      "giveaways",
      new TableColumn({
        name: "winner_thread_closed_ids",
        type: "text",
      }),
    );
    // MySQL backfills a new NOT NULL text column with '' for existing rows, which isn't valid JSON — same issue
    // 1785200000000-FixEmptyGiveawayJsonColumns fixed for the original batch of simple-json columns.
    await queryRunner.query(
      `UPDATE giveaways SET winner_thread_closed_ids = '[]' WHERE winner_thread_closed_ids = '' OR winner_thread_closed_ids IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn("giveaways", "winner_thread_closed_ids");
  }
}
