import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddSupporterRequirementsToGiveaways1786200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.addColumns("giveaways", [
      new TableColumn({
        name: "required_supporter_level",
        type: "int",
        isNullable: true,
      }),
      new TableColumn({
        name: "blacklisted_supporter_levels",
        type: "text",
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumns("giveaways", ["required_supporter_level", "blacklisted_supporter_levels"]);
  }
}
