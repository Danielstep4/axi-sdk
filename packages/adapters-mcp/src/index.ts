import { resource, type AxiResource } from "@axi/cli";
import { error, type AxiEnvelope } from "@axi/core";

export interface McpExecutor {
  (tool: string, input: unknown): Promise<unknown>;
}

export interface WrapMcpOptions {
  name: string;
  description: string;
  execute: McpExecutor;
  listTool?: string;
  detailTool?: string;
  mapList?: (result: unknown) => unknown[];
  mapDetail?: (result: unknown) => unknown;
  mapError?: (cause: unknown) => AxiEnvelope;
}

function translateError(cause: unknown, mapper?: (cause: unknown) => AxiEnvelope): AxiEnvelope {
  if (mapper) {
    return mapper(cause);
  }

  const message = cause instanceof Error ? cause.message : "MCP backend failed";
  return error(message, { code: "MCP" });
}

export function wrapMcpResource(options: WrapMcpOptions): AxiResource {
  return resource({
    name: options.name,
    description: options.description,
    list: options.listTool
      ? async () => {
          try {
            const result = await options.execute(options.listTool as string, {});
            return options.mapList ? options.mapList(result) : (result as unknown[]);
          } catch (cause) {
            return translateError(cause, options.mapError);
          }
        }
      : undefined,
    view: options.detailTool
      ? async (id) => {
          try {
            const result = await options.execute(options.detailTool as string, { id });
            return options.mapDetail ? options.mapDetail(result) : result;
          } catch (cause) {
            return translateError(cause, options.mapError);
          }
        }
      : undefined,
  });
}
