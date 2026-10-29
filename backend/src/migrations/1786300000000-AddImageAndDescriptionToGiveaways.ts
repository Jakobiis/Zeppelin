import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddImageAndDescriptionToGiveaways1786300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.addColumns("giveaways", [
      new TableColumn({
        name: "image_url",
        type: "text",
        isNullable: true,
      }),
      new TableColumn({
        name: "description",
        type: "text",
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropColumns("giveaways", ["image_url", "description"]);
  }
}
