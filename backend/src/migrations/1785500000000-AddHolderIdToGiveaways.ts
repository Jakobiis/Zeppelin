import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

// Nullable with no default — existing rows backfill to NULL, i.e. "not staff-held", which is the correct
// meaning for every giveaway created before this column existed.
export class AddHolderIdToGiveaways1785500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.addColumn(
      "giveaways",
      new TableColumn({
        name: "holder_id",
        type: "bigint",
        unsigned: true,
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumn("giveaways", "holder_id");
  }
}
