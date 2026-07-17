import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("counter_decay_role_states")
export class CounterDecayRoleState {
  @Column({ type: "bigint", generated: "increment" })
  @PrimaryColumn()
  id: string;

  @Column()
  counter_id: number;

  @Column({ type: "bigint" })
  role_id: string;

  @Column()
  last_decay_at: string;
}
