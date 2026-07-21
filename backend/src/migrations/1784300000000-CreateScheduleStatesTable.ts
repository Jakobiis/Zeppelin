import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateScheduleStatesTable1784300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "schedule_states",
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
            name: "schedule_name",
            type: "varchar",
            length: "100",
          },
          {
            name: "active",
            type: "boolean",
          },
          {
            name: "active_until",
            type: "datetime",
            isNullable: true,
            default: null,
          },
          {
            name: "last_duration_ms",
            type: "bigint",
            isNullable: true,
            default: null,
          },
          {
            name: "last_rolled_bucket",
            type: "bigint",
            isNullable: true,
            default: null,
          },
          {
            name: "last_remind_at",
            type: "datetime",
            isNullable: true,
            default: null,
          },
        ],
        indices: [
          {
            columnNames: ["guild_id", "schedule_name"],
            isUnique: true,
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("schedule_states");
  }
}
