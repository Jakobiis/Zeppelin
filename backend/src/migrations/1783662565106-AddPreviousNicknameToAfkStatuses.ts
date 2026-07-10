import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddPreviousNicknameToAfkStatuses1783662565106 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "afk_statuses",
      new TableColumn({
        name: "previous_nickname",
        type: "text",
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("afk_statuses", "previous_nickname");
  }
}
