// Shared JSON-Schema classification helpers used by both PluginConfigForm (the root field list) and
// PluginConfigField (recursive per-field rendering) — kept in one place so the "is this field simple enough to
// sit in a packed grid cell, or does it need the full row" decision can't drift between the two.
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";

// zod's toJSONSchema hoists any schema that's referenced more than once (e.g. the recursive all/any/not fields
// on override criteria, or any sub-schema two plugin config fields happen to share the same zod instance for)
// into `$defs`, replacing every occurrence with `{ $ref: "#/$defs/name" }`. Called once, right after the schema
// is fetched, to fully inline those refs so nothing downstream needs to know $ref exists. Genuinely cyclic refs
// (the all/any/not case, which recurse into themselves) are capped at one level deep — the second occurrence of
// the same ref along a given path becomes `{}` (renders as a raw-JSON fallback) instead of recursing forever.
export function dereferenceSchema(node: any, defs: Record<string, any>, seen: Set<string> = new Set()): any {
  if (node == null || typeof node !== "object") return node;

  if (typeof node.$ref === "string") {
    const name = node.$ref.split("/").pop()!;
    if (seen.has(name) || !defs[name]) return {};
    const { $ref, ...rest } = node;
    return { ...rest, ...dereferenceSchema(defs[name], defs, new Set([...seen, name])) };
  }

  if (Array.isArray(node)) {
    return node.map((item) => dereferenceSchema(item, defs, seen));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" && value && typeof value === "object") {
      const props: Record<string, any> = {};
      for (const [propKey, propSchema] of Object.entries(value)) {
        props[propKey] = dereferenceSchema(propSchema, defs, seen);
      }
      result[key] = props;
    } else if (key === "items" || key === "additionalProperties") {
      result[key] = dereferenceSchema(value, defs, seen);
    } else if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(value)) {
      result[key] = value.map((v) => dereferenceSchema(v, defs, seen));
    } else if (key !== "$defs") {
      result[key] = value;
    }
  }
  return result;
}

// A nullable field is represented in JSON Schema as an `anyOf` with exactly one `{type: "null"}` branch (how
// zod's toJSONSchema exports `.nullable()`, including when nullable wraps a multi-branch union) — unwrap that
// into a `{ nullable, inner }` pair callers work with instead.
export function unwrapNullable(s: any): { nullable: boolean; inner: any } {
  if (s?.anyOf && Array.isArray(s.anyOf)) {
    const nullBranches = s.anyOf.filter((b: any) => b.type === "null");
    const otherBranches = s.anyOf.filter((b: any) => b.type !== "null");
    if (nullBranches.length === 1 && otherBranches.length >= 1) {
      const inner = otherBranches.length === 1 ? otherBranches[0] : { anyOf: otherBranches };
      return { nullable: true, inner };
    }
  }
  return { nullable: false, inner: s };
}

// Classifies an (already nullable-unwrapped) schema node into the "kind" of control it should render as.
export function classifyKind(s: any): string {
  if (!s) return "unsupported";
  // A fixed literal (e.g. a discriminated union's `type: "wager"` tag) — otherwise indistinguishable from a
  // plain string/number/boolean field, which would render it as an editable input for a value that can only
  // ever be the one thing. Checked before those so the const takes priority.
  if (s.const !== undefined) return "const";
  if (s.type === "boolean") return "boolean";
  if (s.type === "string" && !s.enum) return "string";
  if (s.type === "number" || s.type === "integer") return "number";
  if (s.type === "array" && s.items) return "array";
  if (s.type === "object" && s.properties) return "object";
  if (s.type === "object" && s.additionalProperties && typeof s.additionalProperties === "object") return "record";
  if (s.anyOf && Array.isArray(s.anyOf) && s.anyOf.length > 1) return "union";
  return "unsupported";
}

// A "simple" schema renders as a single inline control (no card, no collapse) — used to decide whether array
// items / record values get the compact flat-row treatment or the collapsible-card treatment.
export function isSimple(s: any): boolean {
  const { inner } = unwrapNullable(s);
  const k = classifyKind(inner);
  return k === "boolean" || k === "string" || k === "number";
}

// The inverse — used to decide whether a field spans the full grid row (objects/arrays/records/unions need the
// room) or can sit packed side-by-side with other simple fields (booleans/strings/numbers). A role/channel/emoji
// picker is technically "simple" by type but needs more horizontal room than a packed column gives it (the emoji
// picker's grid in particular gets cramped and can spill into neighboring columns), so those go wide too — a
// color swatch + hex box is about as compact as a normal input though, so that one stays packed.
export function isWide(s: any, fieldKey?: string): boolean {
  const special = fieldKey ? detectSpecialFieldKind(fieldKey, s) : null;
  if (special && special !== "color") return true;
  return !isSimple(s);
}

// A schema's `default` is a single object living on the (cached) JSON Schema itself — returning it as-is would
// hand out that exact same array/object reference every time the same schema node's default is used (e.g. every
// record entry missing the same optional field, or several "+ Add" clicks against the same item schema). Since
// those defaults then get embedded at multiple places in the same value tree, js-yaml's dumper — seeing the same
// reference twice — represents it with a YAML anchor/alias, which the backend's anti-YAML-bomb guard rejects
// outright ("Object aliases are not allowed") on save. Cloning guarantees every fill gets its own independent copy.
// Cached schemas live in Vue-reactive component state, so `value` (or something nested in it) is often a
// reactive Proxy by the time it gets here — structuredClone throws on those ("Proxy object could not be
// cloned"), so this goes through JSON instead, which reads straight through a Proxy's get traps to the
// underlying plain value. Safe here specifically because schema defaults only ever contain JSON-safe data (they
// came from a JSON HTTP response in the first place) — never Dates, Maps, undefined, etc. that JSON would mangle.
function cloneDefault<T>(value: T): T {
  return typeof value === "object" && value !== null ? JSON.parse(JSON.stringify(value)) : value;
}

// Best-effort default value for a schema node — used when switching a nullable field from unset to set, adding
// a new array item, adding a new record entry, or switching a union's active branch.
export function defaultForSchema(s: any): any {
  if (s == null) return null;
  if (s.const !== undefined) return s.const;
  if (s.default !== undefined) return cloneDefault(s.default);
  if (s.anyOf) {
    const nonNull = s.anyOf.find((b: any) => b.type !== "null");
    return nonNull ? defaultForSchema(nonNull) : null;
  }
  if (s.type === "string") return "";
  if (s.type === "number" || s.type === "integer") return 0;
  if (s.type === "boolean") return false;
  if (s.type === "array") return [];
  if (s.type === "object") {
    if (!s.properties) return {};
    // Only pre-fills properties with an unambiguous value of their own (a const — most importantly a
    // discriminated union's `type` tag — or an explicit schema default): a discriminated union branch (e.g. a
    // newly-added or newly-switched-to "hol" game) needs its `type` actually set to that literal, or the
    // backend's "no type = wager" back-compat fallback silently treats it as a wager game instead. Properties
    // with no default of their own are left absent, same as everywhere else — they still need real user input,
    // and synthesizing a placeholder like 0/"" for them would look like a real (and likely invalid) value.
    const result: Record<string, any> = {};
    for (const [key, propSchema] of Object.entries<any>(s.properties)) {
      if (propSchema?.const !== undefined || propSchema?.default !== undefined) {
        result[key] = defaultForSchema(propSchema);
      }
    }
    return result;
  }
  return null;
}

export function prettifyKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Builds a short "key: value · key: value" preview from an object's own leaf (string/number/boolean/scalar-array)
// properties, in schema property order — used as the collapsed-state label for array items and record entries
// so a collapsed override/rule/game doesn't just show a blank bar. Skips nested objects/arrays (like an
// override's `config` block) since those don't summarize into a short string usefully.
//
// `resolveLabel`, if given, is consulted for every string leaf/array-item value (e.g. to turn a role/channel id
// into its actual name) — returning null falls back to showing the raw value as-is.
export function summarizeObjectValue(
  value: any,
  propsSchema: Record<string, any> | undefined,
  resolveLabel?: (key: string, schema: any, rawValue: string) => string | null,
): string {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return "";

  const label = (key: string, v: string): string => {
    const resolved = resolveLabel?.(key, propsSchema?.[key], v) ?? null;
    if (resolved) return resolved;
    return v.length > 24 ? `${v.slice(0, 24)}…` : v;
  };

  const parts: string[] = [];
  for (const key of Object.keys(propsSchema ?? {})) {
    if (parts.length >= 3) break;

    const v = value[key];
    if (v == null) continue;

    if (typeof v === "string") {
      if (v.trim() === "") continue;
      parts.push(`${prettifyKey(key)}: ${label(key, v)}`);
    } else if (typeof v === "number") {
      parts.push(`${prettifyKey(key)}: ${v}`);
    } else if (typeof v === "boolean") {
      if (v) parts.push(prettifyKey(key));
    } else if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" || typeof x === "number")) {
      const shown = v.slice(0, 2).map((x) => (typeof x === "string" ? label(key, x) : x));
      parts.push(`${prettifyKey(key)}: ${shown.join(", ")}${v.length > 2 ? "…" : ""}`);
    }
  }
  return parts.join(" · ");
}

// Detects the common "a single T, or a list of T" pattern — a 2-branch union where one branch is an array and
// the other is that same array's item type on its own (e.g. override criteria like `channel: string | string[]`,
// or a message's `embeds: EmbedInput | EmbedInput[]`). Returns the leaf schema (used to render/default each
// item) or null if the shape doesn't match. T can be a plain scalar or a whole object — either way this is what
// keeps something like "one embed, or several" from needing its own branch-picker dropdown (which would just
// read as "List" vs. a jumble of the object's first few property names): it's just a normal add/remove list.
export function detectMultiLeafSchema(s: any): any | null {
  const branches: any[] = s?.anyOf ?? [];
  if (branches.length !== 2) return null;

  const arrBranch = branches.find((b) => b.type === "array" && b.items);
  const leafBranch = branches.find((b) => b !== arrBranch);
  if (!arrBranch || !leafBranch) return null;

  const leafKind = classifyKind(unwrapNullable(leafBranch).inner);
  if (leafKind === "unsupported" || leafKind === "union") return null;

  const itemsKind = classifyKind(unwrapNullable(arrBranch.items).inner);
  if (itemsKind !== leafKind) return null;

  return leafBranch;
}

// Purely an implementation artifact of the override criteria schema's self-referential type (a getter that
// returns itself, needed only to make TS infer the recursive type) — never a real, user-settable field. Filtered
// out everywhere object properties are enumerated so it can never appear in the rendered form.
const HIDDEN_PROPERTY_KEYS = new Set(["zzz_dummy_property_do_not_use"]);

// Splits an object schema's properties into "visible" (always shown — required fields, or optional fields that
// currently hold a real value) and "hidden" (optional fields that are unset, offered via a "+ Add field" picker
// instead of being shown as a permanent "Not set" row). This is what keeps a field list — most importantly
// overrides, where the vast majority of criteria are usually unused — from listing every possible property at
// once: only what's required or already in use takes up space, everything else is a click away.
export function getObjectFieldKeys(schema: any, value: any): { visible: string[]; hidden: string[] } {
  const props = schema?.properties ?? {};
  const required = new Set<string>(schema?.required ?? []);
  const val = value ?? {};
  const visible: string[] = [];
  const hidden: string[] = [];
  for (const key of Object.keys(props)) {
    if (HIDDEN_PROPERTY_KEYS.has(key)) continue;
    // A const (e.g. a discriminated union's `type: "wager"` tag) can only ever hold the one value the branch
    // already implies — showing it as an editable field is at best redundant with whatever picked this branch
    // (a union dropdown one level up) and at worst reads as a broken, un-editable-looking input.
    if (props[key]?.const !== undefined) continue;
    const isSet = val[key] !== null && val[key] !== undefined;
    if (required.has(key) || isSet) visible.push(key);
    else hidden.push(key);
  }
  return { visible, hidden };
}

// Recursively checks whether a schema+value subtree contains anything matching `query` — a field's own
// (prettified) key, a record entry's key, or a leaf's stringified value. Powers the interface-wide search bar:
// a plugin's top-level fields and nested containers (objects/records/arrays) are filtered/auto-expanded based on
// this, so searching "ttt" can surface one specific game buried inside a record without manually expanding down
// to it first.
export function schemaValueMatchesSearch(schema: any, value: any, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();

  const { inner } = unwrapNullable(schema);
  const kind = classifyKind(inner);

  if (kind === "object" && inner.properties) {
    return Object.keys(inner.properties).some((key) => {
      if (HIDDEN_PROPERTY_KEYS.has(key) || inner.properties[key]?.const !== undefined) return false;
      if (prettifyKey(key).toLowerCase().includes(q)) return true;
      return schemaValueMatchesSearch(inner.properties[key], (value ?? {})[key], q);
    });
  }
  if (kind === "record") {
    const val = value ?? {};
    return Object.keys(val).some((key) => {
      if (key.toLowerCase().includes(q)) return true;
      return schemaValueMatchesSearch(inner.additionalProperties, val[key], q);
    });
  }
  if (kind === "array") {
    const list = Array.isArray(value) ? value : [];
    return list.some((item) => schemaValueMatchesSearch(inner.items, item, q));
  }
  if (kind === "string" || kind === "number") {
    return value != null && String(value).toLowerCase().includes(q);
  }
  return false;
}

// Wraps getObjectFieldKeys with a stable display order for the "visible" side: that function alone only knows
// schema-declaration order, so a newly-added optional field (via "+ Add field") would appear wherever its key
// happens to sit in the schema instead of after the fields already showing — reading as the field landing in a
// random, confusing spot in the card instead of at the bottom where the "+ Add field" control that added it
// sits. This keeps each already-visible field's position stable and appends newly-visible ones at the end; a
// field that gets unset (and possibly re-added later) starts fresh at the end again rather than trying to
// remember its old spot.
export function useOrderedObjectFieldKeys(
  schema: Ref<any> | ComputedRef<any>,
  value: Ref<any> | ComputedRef<any>,
): { visible: ComputedRef<string[]>; hidden: ComputedRef<string[]> } {
  const raw = computed(() => getObjectFieldKeys(schema.value, value.value));

  const order = ref<string[]>([...raw.value.visible]);
  watch(
    () => raw.value.visible,
    (nextVisible) => {
      const stillVisible = order.value.filter((k) => nextVisible.includes(k));
      const added = nextVisible.filter((k) => !stillVisible.includes(k));
      order.value = [...stillVisible, ...added];
    },
  );

  return {
    visible: computed(() => order.value),
    hidden: computed(() => raw.value.hidden),
  };
}

// Recursively fills in values missing from `rawValue` using each field's own schema-level default — used when
// deriving the Interface view's state from hand-edited raw YAML, so a field the user's text simply didn't
// mention (because it's happy with the default) still shows that default instead of appearing blank/unset.
// Fields with no declared default of their own are left as-is; the field's existing required/nullable rendering
// already handles "genuinely missing" sensibly (a "Not set" placeholder, or hidden behind "+ Add field").
export function fillDefaults(schema: any, rawValue: any): any {
  if (schema == null) return rawValue;
  const { inner } = unwrapNullable(schema);
  const ownDefault = schema.default !== undefined ? schema.default : inner?.default;

  if (rawValue === undefined) return ownDefault !== undefined ? cloneDefault(ownDefault) : rawValue;
  if (rawValue === null) return null;

  const kind = classifyKind(inner);
  if (kind === "object" && inner.properties && typeof rawValue === "object" && !Array.isArray(rawValue)) {
    const result: Record<string, any> = { ...rawValue };
    for (const key of Object.keys(inner.properties)) {
      result[key] = fillDefaults(inner.properties[key], rawValue[key]);
    }
    return result;
  }
  if (kind === "array" && Array.isArray(rawValue)) {
    return rawValue.map((item) => fillDefaults(inner.items, item));
  }
  if (kind === "record" && typeof rawValue === "object" && !Array.isArray(rawValue)) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(rawValue)) {
      result[key] = fillDefaults(inner.additionalProperties, rawValue[key]);
    }
    return result;
  }
  return rawValue;
}

export type SpecialFieldKind = "role" | "channel" | "emoji" | "color";

// Guesses whether a field's property key names a Discord role/channel/emoji ID (or a list of them), or a numeric
// embed color, so it can be rendered with a picker instead of a raw ID/number box. Deliberately keyed off the
// raw property name (not the prettified label) since that's the more stable/reliable signal.
export function detectSpecialFieldKind(key: string | undefined, schema: any): SpecialFieldKind | null {
  if (!key) return null;
  const k = key.toLowerCase();

  const { inner } = unwrapNullable(schema);

  // Colors are a single plain number (not string-leaf-shaped like the id fields below), checked first since
  // it's a completely different underlying value shape.
  if (k.includes("color") && classifyKind(inner) === "number") return "color";

  // Fires for string fields (a single ID), arrays of strings (a list of IDs), or the "single T or T[]" pattern —
  // anything else falls through to the generic renderer.
  let leaf = inner;
  if (inner?.type === "array" && inner.items) {
    leaf = unwrapNullable(inner.items).inner;
  } else {
    const multiLeaf = detectMultiLeafSchema(inner);
    if (multiLeaf) {
      leaf = unwrapNullable(multiLeaf).inner;
    }
  }
  if (classifyKind(leaf) !== "string") return null;

  if (k.includes("emoji")) return "emoji";
  if (k.includes("role")) return "role";
  if (k.includes("channel")) return "channel";
  return null;
}
