// Helpers for the YAML tab: a line-based outline (so it keeps exact line numbers, which a parsed object can't give)
// and a merge for pasted snippets.

export interface OutlineNode {
  label: string;
  // "/"-joined key path; list items use their index among the parent's keyed items (e.g. plugins/automod/overrides/0)
  path: string;
  line: number; // 1-based
  endLine: number;
  depth: number;
  column: number;
  parent: OutlineNode | null;
  children: OutlineNode[];
}

const KEY_LINE = /^(\s*)(-\s+)?("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#'"\-?:,[\]{}][^#:]*?)\s*:(?:\s+(.*))?$/;
const BLOCK_SCALAR = /^[|>][-+0-9]*\s*(#.*)?$/;

function unquote(key: string) {
  if (key.startsWith('"') || key.startsWith("'")) return key.slice(1, -1);
  return key;
}

export function buildOutline(text: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  const lines = text.split("\n");
  let lastContentLine = 0;
  let blockScalarColumn = -1;

  const popTo = (column: number) => {
    while (stack.length && stack[stack.length - 1].column >= column) {
      stack.pop()!.endLine = lastContentLine;
    }
  };

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) return;
    const indent = line.length - line.trimStart().length;

    if (blockScalarColumn >= 0) {
      if (indent > blockScalarColumn) {
        lastContentLine = lineNo;
        return;
      }
      blockScalarColumn = -1;
    }
    if (line.trimStart().startsWith("#") || line.startsWith("---")) return;

    const m = KEY_LINE.exec(line);
    if (!m) {
      lastContentLine = lineNo;
      return;
    }
    const [, ws, dash, rawKey, value = ""] = m;
    const key = unquote(rawKey.trim());
    const keyColumn = ws.length + (dash?.length ?? 0);

    if (dash) {
      // A keyed list item, e.g. an override's "- role: ...". The item becomes a node; its first key is its label.
      popTo(ws.length);
      const parent = stack[stack.length - 1] ?? null;
      const siblings = parent ? parent.children : roots;
      const index = siblings.filter((n) => n.label.startsWith("- ")).length;
      const shortValue = value.replace(/\s+#.*$/, "").slice(0, 40);
      const item: OutlineNode = {
        label: `- ${key}${shortValue ? `: ${shortValue}` : ""}`,
        path: `${parent ? parent.path + "/" : ""}${index}`,
        line: lineNo,
        endLine: lineNo,
        depth: parent ? parent.depth + 1 : 0,
        column: ws.length,
        parent,
        children: [],
      };
      siblings.push(item);
      stack.push(item);
    } else {
      popTo(keyColumn);
      const parent = stack[stack.length - 1] ?? null;
      const node: OutlineNode = {
        label: key,
        path: `${parent ? parent.path + "/" : ""}${key}`,
        line: lineNo,
        endLine: lineNo,
        depth: parent ? parent.depth + 1 : 0,
        column: keyColumn,
        parent,
        children: [],
      };
      (parent ? parent.children : roots).push(node);
      stack.push(node);
    }

    if (BLOCK_SCALAR.test(value)) blockScalarColumn = keyColumn;
    lastContentLine = lineNo;
  });

  popTo(-1);
  return roots;
}

// Deepest node whose range contains the line.
export function nodeAtLine(roots: OutlineNode[], line: number): OutlineNode | null {
  let found: OutlineNode | null = null;
  let level = roots;
  for (;;) {
    const hit = level.find((n) => n.line <= line && line <= n.endLine);
    if (!hit) return found;
    found = hit;
    level = hit.children;
  }
}

export function findNodeByPath(roots: OutlineNode[], path: string): OutlineNode | null {
  const parts = path.split("/");
  // Falls back to the closest existing ancestor
  while (parts.length) {
    const wanted = parts.join("/");
    const stack = [...roots];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.path === wanted) return n;
      if (wanted.startsWith(n.path + "/")) stack.push(...n.children);
    }
    parts.pop();
  }
  return null;
}

export interface MergeChange {
  path: string;
  kind: "added" | "replaced";
}

const isObject = (v: unknown): v is Record<string, any> => v != null && typeof v === "object" && !Array.isArray(v);

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (isObject(a) && isObject(b)) {
    const ak = Object.keys(a);
    return ak.length === Object.keys(b).length && ak.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

function withoutConfig(override: Record<string, any>) {
  const { config, ...criteria } = override;
  return criteria;
}

function mergeInto(target: Record<string, any>, source: Record<string, any>, path: string, changes: MergeChange[]) {
  for (const [key, value] of Object.entries(source)) {
    const p = path ? `${path}/${key}` : key;
    if (!(key in target)) {
      target[key] = structuredClone(value);
      changes.push({ path: p, kind: "added" });
    } else if (key === "overrides" && Array.isArray(target[key]) && Array.isArray(value)) {
      // Overrides with identical criteria (same role/channel/level/...) get their configs merged; others are appended
      for (const override of value) {
        if (!isObject(override)) continue;
        const criteria = withoutConfig(override);
        const index = target[key].findIndex((o: any) => isObject(o) && deepEqual(withoutConfig(o), criteria));
        if (index === -1) {
          target[key].push(structuredClone(override));
          changes.push({ path: `${p}/${target[key].length - 1}`, kind: "added" });
        } else if (isObject(override.config)) {
          const existing = target[key][index];
          if (!isObject(existing.config)) existing.config = {};
          mergeInto(existing.config, override.config, `${p}/${index}/config`, changes);
        }
      }
    } else if (isObject(target[key]) && isObject(value)) {
      mergeInto(target[key], value, p, changes);
    } else if (!deepEqual(target[key], value)) {
      target[key] = structuredClone(value);
      changes.push({ path: p, kind: "replaced" });
    }
  }
}

// Snippets can be a full config fragment ("plugins: automod: ...") or start at the plugin name ("automod: ...").
export function mergeSnippet(config: unknown, snippet: unknown, pluginNames: string[]) {
  if (!isObject(snippet)) throw new Error("The snippet must be a YAML mapping (key: value), not a list or a single value.");
  const keys = Object.keys(snippet);
  if (keys.every((k) => k === "config" || k === "overrides")) {
    throw new Error("Can't tell which plugin this belongs to. Wrap it in the plugin name, e.g.\n\nautomod:\n  config:\n    ...");
  }
  const rooted = !("plugins" in snippet) && keys.every((k) => pluginNames.includes(k)) ? { plugins: snippet } : snippet;
  const result = isObject(config) ? structuredClone(config) : {};
  const changes: MergeChange[] = [];
  mergeInto(result, rooted, "", changes);
  return { result, changes };
}
