import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resource, type AxiResource } from "@axi/cli";
import { error, type AxiEnvelope } from "@axi/core";

const execFileAsync = promisify(execFile);

export interface JsonCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface WrapCommandOptions<ListRow = unknown, DetailRow = unknown> {
  name: string;
  description: string;
  runList?: () => Promise<ListRow[]> | ListRow[];
  runDetail?: (id: string) => Promise<DetailRow> | DetailRow;
  mapList?: (rows: ListRow[]) => unknown[];
  mapDetail?: (row: DetailRow) => unknown;
  mapError?: (cause: unknown) => AxiEnvelope;
}

export async function runJson(command: string, args: string[], options: JsonCommandOptions = {}): Promise<unknown> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    env: options.env,
  });

  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(stderr.trim() || `Command ${command} did not return valid JSON`);
  }
}

function translateError(cause: unknown, mapper?: (cause: unknown) => AxiEnvelope): AxiEnvelope {
  if (mapper) {
    return mapper(cause);
  }

  const message = cause instanceof Error ? cause.message : "Backend command failed";
  return error(message, { code: "BACKEND" });
}

export function wrapCommand<ListRow = unknown, DetailRow = unknown>(options: WrapCommandOptions<ListRow, DetailRow>): AxiResource {
  return resource({
    name: options.name,
    description: options.description,
    list: options.runList
      ? async () => {
          try {
            const rows = await options.runList?.();
            return options.mapList ? options.mapList(rows ?? []) : rows ?? [];
          } catch (cause) {
            return translateError(cause, options.mapError);
          }
        }
      : undefined,
    view: options.runDetail
      ? async (id) => {
          try {
            const row = await options.runDetail?.(id);
            return options.mapDetail ? options.mapDetail(row as DetailRow) : row;
          } catch (cause) {
            return translateError(cause, options.mapError);
          }
        }
      : undefined,
  });
}
