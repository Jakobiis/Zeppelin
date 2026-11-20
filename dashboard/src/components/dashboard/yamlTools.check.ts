// Run: npx tsx dashboard/src/components/dashboard/yamlTools.check.ts
import assert from "node:assert/strict";
import { buildOutline, findNodeByPath, mergeSnippet, nodeAtLine } from "./yamlTools";

const text = `prefix: "!"
plugins:
  automod:
    config:
      rules:
        spam:
          triggers:
            - any_message: {}
          actions:
            reply: |
              hello: not a key
    overrides:
      - role: "1"
        config:
          rules:
            spam:
              enabled: true
  utility: {}
`;

const outline = buildOutline(text);
assert.deepEqual(outline.map((n) => n.label), ["prefix", "plugins"]);
const override = findNodeByPath(outline, "plugins/automod/overrides/0")!;
assert.equal(override.line, 13);
assert.equal(override.endLine, 17);
assert.equal(nodeAtLine(outline, 11)!.path, "plugins/automod/config/rules/spam/actions/reply"); // block scalar body
assert.equal(findNodeByPath(outline, "plugins/utility")!.line, 18);
assert.equal(findNodeByPath(outline, "plugins/automod/nope")!.path, "plugins/automod");

const config = { plugins: { automod: { config: { rules: { spam: { enabled: false } } }, overrides: [{ role: "1", config: { rules: { spam: { enabled: true } } } }] } } };
const { result, changes } = mergeSnippet(
  config,
  {
    automod: {
      config: { rules: { nick: { enabled: false } } },
      overrides: [
        { role: "1", config: { rules: { nick: { enabled: true } } } },
        { role: "2", config: { rules: { nick: { enabled: true } } } },
      ],
    },
  },
  ["automod"],
);
assert.deepEqual(changes, [
  { path: "plugins/automod/config/rules/nick", kind: "added" },
  { path: "plugins/automod/overrides/0/config/rules/nick", kind: "added" },
  { path: "plugins/automod/overrides/1", kind: "added" },
]);
assert.equal(result.plugins.automod.overrides.length, 2);
assert.equal(config.plugins.automod.overrides.length, 1); // input untouched
assert.throws(() => mergeSnippet({}, { config: {} }, ["automod"]));
console.log("ok");
