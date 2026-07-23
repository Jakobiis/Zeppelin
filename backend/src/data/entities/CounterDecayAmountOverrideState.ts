import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("counter_decay_amount_override_states")
export class CounterDecayAmountOverrideState {
  @Column({ type: "bigint", generated: "increment" })
  @PrimaryColumn()
  id: string;

  @Column()
  counter_id: number;

  @Column()
  threshold: number;

  @Column()
  last_decay_at: string;
}
