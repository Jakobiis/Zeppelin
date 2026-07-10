import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateAfkStatusesTable1783658895424 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.createTable(
      new Table({
        name: "afk_statuses",
        columns: [
          {
            name: "id",
            type: "int",
            unsigned: true,
            isGenerated: true,
            generationStrategy: "increment",
            isPrimary: true,
          },
          {
            name: "guild_id",
            type: "bigint",
            unsigned: true,
          },
          {
            name: "user_id",
            type: "bigint",
            unsigned: true,
          },
          {
            name: "message",
            type: "text",
          },
          {
            name: "created_at",
            type: "datetime",
          },
        ],
        indices: [
          {
            columnNames: ["guild_id", "user_id"],
            isUnique: true,
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropTable("afk_statuses", true);
  }
}
