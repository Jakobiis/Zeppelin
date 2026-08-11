// Shared JSON-Schema classification helpers used by both PluginConfigForm (the root field list) and
// PluginConfigField (recursive per-field rendering) — kept in one place so the "is this field simple enough to
// sit in a packed grid cell, or does it need the full row" decision can't drift between the two.

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
// room) or can sit packed side-by-side with other simple fields (booleans/strings/numbers).
export function isWide(s: any): boolean {
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
