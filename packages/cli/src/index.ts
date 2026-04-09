import { EXIT_CODES, detail, error, list, toon, type AxiEnvelope } from "@axi/core";

export interface CliIo {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  cwd?: string;
}

export interface ResourceContext {
  argv: string[];
  full: boolean;
  io: CliIo;
}

export interface AxiResource {
  name: string;
  description: string;
  home?: (context: ResourceContext) => Promise<unknown> | unknown;
  list?: (context: ResourceContext) => Promise<unknown> | unknown;
  view?: (id: string, context: ResourceContext) => Promise<unknown> | unknown;
  create?: (input: unknown, context: ResourceContext) => Promise<unknown> | unknown;
  update?: (id: string, input: unknown, context: ResourceContext) => Promise<unknown> | unknown;
}

export interface RunOptions {
  argv?: string[];
  io?: CliIo;
}

const defaultIo: CliIo = {
  stdout: { write: (chunk) => process.stdout.write(chunk) },
  stderr: { write: (chunk) => process.stderr.write(chunk) },
  cwd: process.cwd(),
};

function isEnvelope(value: unknown): value is AxiEnvelope {
  return typeof value === "object" && value !== null && "kind" in value && "ok" in value;
}

function emit(io: CliIo, value: AxiEnvelope): void {
  io.stdout.write(`${toon(value)}\n`);
}

function helpText(resource: AxiResource): string {
  const commands = [
    resource.home ? "  <no-args>   show the default resource view" : "",
    resource.list ? "  list        list resources" : "",
    resource.view ? `  view <id>   show one ${resource.name} item` : "",
    resource.create ? `  create <json> create a ${resource.name} item from JSON input` : "",
    resource.update ? `  update <id> <json> update a ${resource.name} item from JSON input` : "",
  ].filter(Boolean);

  return [`${resource.name}: ${resource.description}`, "", "Commands:", ...commands, "", "Flags:", "  --full      include all fields in detail views", "  --help      show help"].join("\n");
}

function parseJsonInput(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Expected a valid JSON object argument");
  }
}

function normalizeResponse(value: unknown, full: boolean): AxiEnvelope {
  if (isEnvelope(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return list(value as Record<string, unknown>[]);
  }

  if (typeof value === "object" && value !== null) {
    return detail(value as Record<string, unknown>, { full });
  }

  return detail({ value }, { full });
}

export function resource(definition: AxiResource): AxiResource {
  return definition;
}

export async function run(target: AxiResource, options: RunOptions = {}): Promise<number> {
  const io = options.io ?? defaultIo;
  const argv = options.argv ?? process.argv.slice(2);
  const full = argv.includes("--full");
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  const context: ResourceContext = { argv, full, io };

  if (wantsHelp) {
    io.stderr.write(`${helpText(target)}\n`);
    return EXIT_CODES.success;
  }

  try {
    if (positional.length === 0) {
      if (target.home) {
        emit(io, normalizeResponse(await target.home(context), full));
        return EXIT_CODES.success;
      }

      if (target.list) {
        emit(io, normalizeResponse(await target.list(context), full));
        return EXIT_CODES.success;
      }

      emit(io, error(`No default action is configured for ${target.name}`, { code: "USAGE" }));
      return EXIT_CODES.usageError;
    }

    const [command, ...rest] = positional;

    if (command === "list" && target.list) {
      emit(io, normalizeResponse(await target.list(context), full));
      return EXIT_CODES.success;
    }

    if (command === "view" && target.view) {
      const id = rest[0];

      if (!id) {
        emit(io, error("Missing required argument: id", { code: "USAGE" }));
        return EXIT_CODES.usageError;
      }

      emit(io, normalizeResponse(await target.view(id, context), full));
      return EXIT_CODES.success;
    }

    if (command === "create" && target.create) {
      const raw = rest[0];

      if (!raw) {
        emit(io, error("Missing required argument: json", { code: "USAGE" }));
        return EXIT_CODES.usageError;
      }

      emit(io, normalizeResponse(await target.create(parseJsonInput(raw), context), full));
      return EXIT_CODES.success;
    }

    if (command === "update" && target.update) {
      const [id, raw] = rest;

      if (!id || !raw) {
        emit(io, error("Missing required arguments: id and json", { code: "USAGE" }));
        return EXIT_CODES.usageError;
      }

      emit(io, normalizeResponse(await target.update(id, parseJsonInput(raw), context), full));
      return EXIT_CODES.success;
    }

    emit(io, error(`Unknown command: ${command}`, { code: "USAGE" }));
    return EXIT_CODES.usageError;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unexpected runtime error";

    if (cause instanceof Error && cause.stack) {
      io.stderr.write(`${cause.stack}\n`);
    }

    emit(io, error(message, { code: "RUNTIME" }));
    return EXIT_CODES.runtimeError;
  }
}
