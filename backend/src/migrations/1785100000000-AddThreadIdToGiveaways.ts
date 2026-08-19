import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddThreadIdToGiveaways1785100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.addColumns("giveaways", [
      new TableColumn({
        name: "winner_thread_ids",
        type: "text",
      }),
      new TableColumn({
        name: "claim_time_ms",
        type: "int",
        unsigned: true,
        isNullable: true,
      }),
      new TableColumn({
        name: "claimed_winner_ids",
        type: "text",
      }),
      new TableColumn({
        name: "expired_winner_ids",
        type: "text",
      }),
      new TableColumn({
        name: "winner_claim_deadlines",
        type: "text",
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumns("giveaways", [
      "winner_thread_ids",
      "claim_time_ms",
      "claimed_winner_ids",
      "expired_winner_ids",
      "winner_claim_deadlines",
    ]);
  }
}
