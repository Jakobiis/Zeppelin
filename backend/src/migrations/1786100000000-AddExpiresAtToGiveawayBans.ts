import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddExpiresAtToGiveawayBans1786100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.addColumn(
      "giveaway_bans",
      new TableColumn({
        name: "expires_at",
        type: "datetime",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn("giveaway_bans", "expires_at");
  }
}
