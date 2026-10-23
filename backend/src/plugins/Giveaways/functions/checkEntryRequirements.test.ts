import test from "ava";
import { checkEntryRequirements } from "./checkEntryRequirements.js";

const base = {
  required_role_ids: [],
  bypass_role_ids: [],
  blacklisted_role_ids: [],
  message_requirement: null,
  counter_requirement: null,
  coins_requirement: null,
  required_supporter_level: null,
  blacklisted_supporter_levels: null,
};
const check = (
  giveaway: { required_supporter_level?: number; blacklisted_supporter_levels?: number[] },
  levels: number[] | null,
) => checkEntryRequirements({ ...base, ...giveaway }, [], null, null, null, levels).allowed;

test("Required supporter level N allows highest level 1..N only", (t) => {
  t.true(check({ required_supporter_level: 3 }, [1]));
  t.true(check({ required_supporter_level: 3 }, [2, 1, 3]));
  t.false(check({ required_supporter_level: 2 }, [2, 1, 3]));
  t.true(check({ required_supporter_level: 2 }, [2]));
  t.false(check({ required_supporter_level: 1 }, []));
});

test("Blacklisted supporter levels deny anyone with that level", (t) => {
  t.false(check({ required_supporter_level: 3, blacklisted_supporter_levels: [2] }, [2]));
  t.true(check({ required_supporter_level: 3, blacklisted_supporter_levels: [2] }, [3]));
  t.true(check({ blacklisted_supporter_levels: [3] }, []));
});

test("Failed supporter lookup denies only when a supporter requirement is set", (t) => {
  t.false(check({ required_supporter_level: 3 }, null));
  t.true(check({}, null));
});
