import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddReasonToGiveawayBans1786000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.addColumn(
      "giveaway_bans",
      new TableColumn({
        name: "reason",
        type: "varchar",
        length: "500",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn("giveaway_bans", "reason");
  }
}
