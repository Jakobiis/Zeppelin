import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateEconomyShopTables1784700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.createTable(
      new Table({
        name: "economy_active_boosts",
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
            name: "boost_type",
            type: "varchar",
            length: "20",
          },
          {
            name: "boost_key",
            type: "varchar",
            length: "32",
          },
          {
            name: "multiplier",
            type: "double",
          },
          {
            name: "expires_at",
            type: "datetime",
          },
        ],
        indices: [
          {
            columnNames: ["guild_id", "user_id", "boost_type"],
            isUnique: true,
          },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "economy_shop_stock",
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
            name: "boost_key",
            type: "varchar",
            length: "32",
          },
          {
            name: "stock_remaining",
            type: "int",
          },
          {
            name: "last_restock_at",
            type: "datetime",
          },
        ],
        indices: [
          {
            columnNames: ["guild_id", "boost_key"],
            isUnique: true,
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropTable("economy_shop_stock");
    await queryRunner.dropTable("economy_active_boosts");
  }
}
