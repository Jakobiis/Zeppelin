import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateVerifiedMembersTable1786400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.createTable(
      new Table({
        name: "verified_members",
        columns: [
          {
            name: "guild_id",
            type: "bigint",
            unsigned: true,
            isPrimary: true,
          },
          {
            name: "user_id",
            type: "bigint",
            unsigned: true,
            isPrimary: true,
          },
          {
            name: "verified_at",
            type: "datetime",
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.dropTable("verified_members");
  }
}
