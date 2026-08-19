import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

// Both new columns are nullable with no NOT NULL default, so — unlike 1785100000000-AddThreadIdToGiveaways —
// existing rows backfill to NULL (a valid, meaningful "no requirement" value), not '' (invalid JSON). No
// separate data-fix migration needed this time.
export class AddCounterRequirementsToGiveaways1785300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.addColumns("giveaways", [
      new TableColumn({
        name: "counter_requirement",
        type: "text",
        isNullable: true,
      }),
      new TableColumn({
        name: "coins_requirement",
        type: "int",
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumns("giveaways", ["counter_requirement", "coins_requirement"]);
  }
}
