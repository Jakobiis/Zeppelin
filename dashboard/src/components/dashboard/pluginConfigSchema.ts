// Shared JSON-Schema classification helpers used by both PluginConfigForm (the root field list) and
// PluginConfigField (recursive per-field rendering) — kept in one place so the "is this field simple enough to
// sit in a packed grid cell, or does it need the full row" decision can't drift between the two.

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
// picker's grid in particular gets cramped and can spill into neighboring columns), so those go wide too.
export function isWide(s: any, fieldKey?: string): boolean {
  if (fieldKey && detectSpecialFieldKind(fieldKey, s)) return true;
  return !isSimple(s);
}

// Best-effort default value for a schema node — used when switching a nullable field from unset to set, adding
// a new array item, adding a new record entry, or switching a union's active branch.
export function defaultForSchema(s: any): any {
  if (s == null) return null;
  if (s.default !== undefined) return s.default;
  if (s.anyOf) {
    const nonNull = s.anyOf.find((b: any) => b.type !== "null");
    return nonNull ? defaultForSchema(nonNull) : null;
  }
  if (s.type === "string") return "";
  if (s.type === "number" || s.type === "integer") return 0;
  if (s.type === "boolean") return false;
  if (s.type === "array") return [];
  if (s.type === "object") return {};
  return null;
}

export function prettifyKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Builds a short "key: value · key: value" preview from an object's own leaf (string/number/boolean/scalar-array)
// properties, in schema property order — used as the collapsed-state label for array items and record entries
// so a collapsed override/rule/game doesn't just show a blank bar. Skips nested objects/arrays (like an
// override's `config` block) since those don't summarize into a short string usefully.
export function summarizeObjectValue(value: any, propsSchema: Record<string, any> | undefined): string {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return "";

  const parts: string[] = [];
  for (const key of Object.keys(propsSchema ?? {})) {
    if (parts.length >= 3) break;

    const v = value[key];
    if (v == null) continue;

    if (typeof v === "string") {
      if (v.trim() === "") continue;
      parts.push(`${prettifyKey(key)}: ${v.length > 24 ? `${v.slice(0, 24)}…` : v}`);
    } else if (typeof v === "number") {
      parts.push(`${prettifyKey(key)}: ${v}`);
    } else if (typeof v === "boolean") {
      if (v) parts.push(prettifyKey(key));
    } else if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" || typeof x === "number")) {
      parts.push(`${prettifyKey(key)}: ${v.slice(0, 2).join(", ")}${v.length > 2 ? "…" : ""}`);
    }
  }
  return parts.join(" · ");
}

// Detects the common "a single T, or a list of T" pattern (e.g. override criteria like `channel: string |
// string[]`) — a 2-branch union where one branch is a simple leaf type and the other is an array of that same
// leaf type. Returns the leaf schema (used to render/default each item) or null if the shape doesn't match.
export function detectMultiLeafSchema(s: any): any | null {
  const branches: any[] = s?.anyOf ?? [];
  if (branches.length !== 2) return null;

  const arrBranch = branches.find((b) => b.type === "array" && b.items);
  const leafBranch = branches.find((b) => b !== arrBranch);
  if (!arrBranch || !leafBranch) return null;

  const leafKind = classifyKind(unwrapNullable(leafBranch).inner);
  if (leafKind !== "string" && leafKind !== "number") return null;

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
    const isSet = val[key] !== null && val[key] !== undefined;
    if (required.has(key) || isSet) visible.push(key);
    else hidden.push(key);
  }
  return { visible, hidden };
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

  if (rawValue === undefined) return ownDefault !== undefined ? ownDefault : rawValue;
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

export type SpecialFieldKind = "role" | "channel" | "emoji";

// Guesses whether a field's property key names a Discord role/channel/emoji ID (or a list of them) so it can be
// rendered with a picker instead of a raw ID text box. Deliberately keyed off the raw property name (not the
// prettified label) since that's the more stable/reliable signal, and only fires for string fields (a single ID),
// arrays of strings (a list of IDs), or the "single T or T[]" pattern above — anything else falls through to the
// generic renderer.
export function detectSpecialFieldKind(key: string | undefined, schema: any): SpecialFieldKind | null {
  if (!key) return null;

  const { inner } = unwrapNullable(schema);
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

  const k = key.toLowerCase();
  if (k.includes("emoji")) return "emoji";
  if (k.includes("role")) return "role";
  if (k.includes("channel")) return "channel";
  return null;
}
