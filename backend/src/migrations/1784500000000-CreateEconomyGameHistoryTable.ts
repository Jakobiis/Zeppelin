import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateEconomyGameHistoryTable1784500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.createTable(
      new Table({
        name: "economy_game_history",
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
            name: "game_name",
            type: "varchar",
            length: "32",
          },
          {
            name: "game_type",
            type: "varchar",
            length: "20",
          },
          {
            name: "outcome",
            type: "varchar",
            length: "10",
          },
          {
            name: "bet_amount",
            type: "int",
          },
          {
            name: "amount_changed",
            type: "int",
          },
          {
            name: "balance_after",
            type: "int",
          },
          {
            name: "opponent_id",
            type: "varchar",
            length: "32",
            isNullable: true,
            default: null,
          },
          {
            name: "created_at",
            type: "datetime",
            default: "CURRENT_TIMESTAMP",
          },
        ],
        indices: [
          {
            columnNames: ["guild_id", "user_id", "created_at"],
          },
          {
            columnNames: ["guild_id", "game_name", "created_at"],
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropTable("economy_game_history");
  }
}
