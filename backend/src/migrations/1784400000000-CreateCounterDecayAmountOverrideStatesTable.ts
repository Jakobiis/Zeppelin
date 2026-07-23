import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateCounterDecayAmountOverrideStatesTable1784400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.createTable(
      new Table({
        name: "counter_decay_amount_override_states",
        columns: [
          {
            name: "id",
            type: "bigint",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "counter_id",
            type: "int",
          },
          {
            name: "threshold",
            type: "int",
          },
          {
            name: "last_decay_at",
            type: "datetime",
          },
        ],
        indices: [
          {
            columnNames: ["counter_id", "threshold"],
            isUnique: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ["counter_id"],
            referencedTableName: "counters",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropTable("counter_decay_amount_override_states");
  }
}
