import test from "ava";
import { diffJbclRoles } from "./jbclRoles.js";

const none = { owner: false, valueteam: false, websitemoderator: false, premium: 0, earlyadopter: false };
const map = { owner: "o", premium_1: "p1", premium_2: "p2", premium_3: "p3" };

test("Premium gets exactly its tier role, others removed; unmapped and foreign roles untouched", (t) => {
  t.deepEqual(diffJbclRoles({ ...none, premium: 2 }, map, ["p1", "x"]), { add: ["p2"], remove: ["p1"] });
  t.deepEqual(diffJbclRoles({ ...none, earlyadopter: true }, map, ["x"]), { add: [], remove: [] });
  t.deepEqual(diffJbclRoles(none, map, ["o", "p3"]), { add: [], remove: ["o", "p3"] });
  t.deepEqual(diffJbclRoles({ ...none, owner: true }, map, ["o"]), { add: [], remove: [] });
});
