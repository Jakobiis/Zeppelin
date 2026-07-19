import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateStickyMessagesTable1784200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.createTable(
      new Table({
        name: "sticky_messages",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "guild_id",
            type: "bigint",
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
          },
          {
            name: "channel_id",
            type: "bigint",
          },
          {
            name: "message_id",
            type: "bigint",
            isNullable: true,
            default: null,
          },
        ],
        indices: [
          {
            columnNames: ["guild_id", "name"],
            isUnique: true,
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropTable("sticky_messages");
  }
}
