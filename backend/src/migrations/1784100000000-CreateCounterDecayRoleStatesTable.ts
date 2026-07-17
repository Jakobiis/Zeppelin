import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateCounterDecayRoleStatesTable1784100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.createTable(
      new Table({
        name: "counter_decay_role_states",
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
            name: "role_id",
            type: "bigint",
          },
          {
            name: "last_decay_at",
            type: "datetime",
          },
        ],
        indices: [
          {
            columnNames: ["counter_id", "role_id"],
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
    await queryRunner.dropTable("counter_decay_role_states");
  }
}
