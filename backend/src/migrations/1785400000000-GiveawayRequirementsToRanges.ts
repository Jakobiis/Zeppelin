import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

// message_requirement/counter_requirement are already simple-json (text) columns, so their shape change from
// {count} to {min, max} needs no schema change — old rows just read as a requirement with min 0 until
// recreated, handled defensively in application code rather than backfilled here. coins_requirement was a
// plain `int` column (added in 1785300000000, already deployed), which can't hold a {min, max} object, so it
// needs to actually change type — dropped and recreated as nullable text, same shape as the other two.
export class GiveawayRequirementsToRanges1785400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn("giveaways", "coins_requirement");
    await queryRunner.addColumn(
      "giveaways",
      new TableColumn({
        name: "coins_requirement",
        type: "text",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn("giveaways", "coins_requirement");
    await queryRunner.addColumn(
      "giveaways",
      new TableColumn({
        name: "coins_requirement",
        type: "int",
        isNullable: true,
      }),
    );
  }
}
