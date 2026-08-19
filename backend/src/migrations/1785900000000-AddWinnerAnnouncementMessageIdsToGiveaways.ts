import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddWinnerAnnouncementMessageIdsToGiveaways1785900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.addColumn(
      "giveaways",
      new TableColumn({
        name: "winner_announcement_message_ids",
        type: "text",
      }),
    );
    // Same empty-string-isn't-valid-JSON backfill as every other simple-json column added after the initial
    // batch (see 1785600000000-AddWinnerThreadClosedIdsToGiveaways).
    await queryRunner.query(
      `UPDATE giveaways SET winner_announcement_message_ids = '[]' WHERE winner_announcement_message_ids = '' OR winner_announcement_message_ids IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn("giveaways", "winner_announcement_message_ids");
  }
}
