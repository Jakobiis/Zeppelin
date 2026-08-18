import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateMessageTrackerCountsTable1784600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.createTable(
      new Table({
        name: "message_tracker_counts",
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
            name: "user_id",
            type: "bigint",
            unsigned: true,
          },
          {
            name: "all_time_count",
            type: "int",
            unsigned: true,
            default: 0,
          },
          {
            name: "daily_count",
            type: "int",
            unsigned: true,
            default: 0,
          },
          {
            name: "daily_date",
            type: "varchar",
            length: "10",
          },
          {
            name: "weekly_count",
            type: "int",
            unsigned: true,
            default: 0,
          },
          {
            name: "weekly_start",
            type: "varchar",
            length: "10",
          },
          {
            name: "monthly_count",
            type: "int",
            unsigned: true,
            default: 0,
          },
          {
            name: "monthly_month",
            type: "varchar",
            length: "7",
          },
        ],
        indices: [
          {
            columnNames: ["guild_id", "user_id"],
            isUnique: true,
          },
          {
            columnNames: ["guild_id", "daily_date", "daily_count"],
          },
          {
            columnNames: ["guild_id", "weekly_start", "weekly_count"],
          },
          {
            columnNames: ["guild_id", "monthly_month", "monthly_count"],
          },
          {
            columnNames: ["guild_id", "all_time_count"],
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropTable("message_tracker_counts");
  }
}
