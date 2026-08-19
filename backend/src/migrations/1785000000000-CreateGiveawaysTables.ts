import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateGiveawaysTables1785000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.createTable(
      new Table({
        name: "giveaways",
        columns: [
          {
            name: "id",
            type: "int",
            unsigned: true,
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "guild_id",
            type: "bigint",
            unsigned: true,
          },
          {
            name: "channel_id",
            type: "bigint",
            unsigned: true,
          },
          {
            name: "message_id",
            type: "bigint",
            unsigned: true,
            isNullable: true,
          },
          {
            name: "host_id",
            type: "bigint",
            unsigned: true,
          },
          {
            name: "prize",
            type: "varchar",
            length: "512",
          },
          {
            name: "winner_count",
            type: "int",
            unsigned: true,
          },
          {
            name: "ends_at",
            type: "datetime",
          },
          {
            name: "ended_at",
            type: "datetime",
            isNullable: true,
          },
          {
            name: "status",
            type: "varchar",
            length: "16",
          },
          {
            name: "embed_color",
            type: "int",
            unsigned: true,
            isNullable: true,
          },
          {
            name: "required_role_ids",
            type: "text",
          },
          {
            name: "bypass_role_ids",
            type: "text",
          },
          {
            name: "blacklisted_role_ids",
            type: "text",
          },
          {
            name: "extra_entries",
            type: "text",
          },
          {
            name: "message_requirement",
            type: "text",
            isNullable: true,
          },
          {
            name: "winner_ids",
            type: "text",
          },
          {
            name: "created_at",
            type: "datetime",
          },
        ],
        indices: [
          {
            columnNames: ["guild_id", "status", "ends_at"],
          },
          {
            columnNames: ["guild_id", "status"],
          },
          {
            columnNames: ["status", "ends_at"],
          },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "giveaway_entries",
        columns: [
          {
            name: "id",
            type: "int",
            unsigned: true,
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "giveaway_id",
            type: "int",
            unsigned: true,
          },
          {
            name: "user_id",
            type: "bigint",
            unsigned: true,
          },
          {
            name: "entries",
            type: "int",
            unsigned: true,
          },
          {
            name: "entered_at",
            type: "datetime",
          },
        ],
        indices: [
          {
            columnNames: ["giveaway_id", "user_id"],
            isUnique: true,
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropTable("giveaway_entries");
    await queryRunner.dropTable("giveaways");
  }
}
