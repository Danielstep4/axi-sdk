export const EXIT_CODES = {
  success: 0,
  runtimeError: 1,
  usageError: 2,
} as const;

export type AxiScalar = string | number | boolean | null;
export type AxiValue = AxiScalar | AxiValue[] | { [key: string]: AxiValue };

export interface AxiEnvelope {
  ok: boolean;
  kind: "list" | "detail" | "empty" | "error" | "noop";
  message?: string;
  [key: string]: AxiValue | boolean | undefined;
}

export interface FormatOptions {
  fields?: string[];
  maxFields?: number;
  truncate?: number;
  full?: boolean;
  message?: string;
}

type RecordLike = Record<string, unknown>;

const PREFERRED_FIELDS = ["id", "name", "title", "status", "state", "summary", "updatedAt", "createdAt"];

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is AxiScalar {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function toAxiValue(value: unknown, maxChars: number): AxiValue {
  if (isPrimitive(value)) {
    return typeof value === "string" ? truncate(value, maxChars) : value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toAxiValue(entry, maxChars));
  }

  if (isRecord(value)) {
    const normalized: { [key: string]: AxiValue } = {};

    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = toAxiValue(entry, maxChars);
    }

    return normalized;
  }

  return truncate(String(value), maxChars);
}

function inferFields(items: RecordLike[], maxFields: number): string[] {
  const discovered = new Set<string>();

  for (const item of items) {
    for (const key of Object.keys(item)) {
      discovered.add(key);
    }
  }

  const ordered = [
    ...PREFERRED_FIELDS.filter((key) => discovered.has(key)),
    ...Array.from(discovered).filter((key) => !PREFERRED_FIELDS.includes(key)),
  ];

  return ordered.slice(0, maxFields);
}

function shapeRecord(record: RecordLike, fields: string[] | undefined, maxChars: number): { [key: string]: AxiValue } {
  const sourceFields = fields ?? Object.keys(record);
  const shaped: { [key: string]: AxiValue } = {};

  for (const field of sourceFields) {
    if (!(field in record)) {
      continue;
    }

    shaped[field] = toAxiValue(record[field], maxChars);
  }

  return shaped;
}

function serializeScalar(value: AxiScalar): string {
  if (typeof value === "string") {
    if (value === "") {
      return "\"\"";
    }

    return /^[A-Za-z0-9._/@:-]+$/.test(value) ? value : JSON.stringify(value);
  }

  return String(value);
}

function serializeValue(value: AxiValue, indent: number): string[] {
  const prefix = "  ".repeat(indent);

  if (isPrimitive(value)) {
    return [serializeScalar(value)];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return ["[]"];
    }

    const lines: string[] = [];

    for (const entry of value) {
      if (isPrimitive(entry)) {
        lines.push(`${prefix}- ${serializeScalar(entry)}`);
        continue;
      }

      const rendered = serializeValue(entry, indent + 1);
      lines.push(`${prefix}- ${rendered[0].trimStart()}`);

      for (const line of rendered.slice(1)) {
        lines.push(line);
      }
    }

    return lines;
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    return ["{}"];
  }

  const lines: string[] = [];

  for (const [key, entry] of entries) {
    if (isPrimitive(entry)) {
      lines.push(`${prefix}${key}: ${serializeScalar(entry)}`);
      continue;
    }

    lines.push(`${prefix}${key}:`);
    lines.push(...serializeValue(entry, indent + 1));
  }

  return lines;
}

export function truncate(value: string, maxChars = 120): string {
  if (maxChars < 4 || value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars - 3)}...`;
}

export function toon(value: AxiValue | AxiEnvelope): string {
  return serializeValue(value as AxiValue, 0).join("\n");
}

export function list(items: RecordLike[], options: FormatOptions = {}): AxiEnvelope {
  if (items.length === 0) {
    return empty(options.message ?? "No items found");
  }

  const fields = options.fields ?? inferFields(items, options.maxFields ?? 4);
  const shaped = items.map((item) => shapeRecord(item, fields, options.truncate ?? 120));

  return {
    ok: true,
    kind: "list",
    count: shaped.length,
    fields,
    items: shaped,
  };
}

export function detail(item: RecordLike, options: FormatOptions = {}): AxiEnvelope {
  const fields = options.full ? undefined : options.fields ?? inferFields([item], options.maxFields ?? 8);

  return {
    ok: true,
    kind: "detail",
    full: Boolean(options.full),
    item: shapeRecord(item, fields, options.truncate ?? 240),
  };
}

export function empty(message: string, options: RecordLike = {}): AxiEnvelope {
  return {
    ok: true,
    kind: "empty",
    message,
    ...shapeRecord(options, undefined, 240),
  };
}

export function error(message: string, options: RecordLike = {}): AxiEnvelope {
  return {
    ok: false,
    kind: "error",
    message,
    ...shapeRecord(options, undefined, 240),
  };
}

export function noop(message: string, options: RecordLike = {}): AxiEnvelope {
  return {
    ok: true,
    kind: "noop",
    message,
    ...shapeRecord(options, undefined, 240),
  };
}
