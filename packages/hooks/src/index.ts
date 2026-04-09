import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { toon, type AxiValue } from "@axi/core";

export interface InstallHookOptions {
  configPath: string;
  executablePath: string;
  contextDirectory: string;
}

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

async function loadJson(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function saveJson(path: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function createSessionStartCommand(executablePath: string, contextDirectory: string): string {
  return `${shellQuote(executablePath)} hooks session-start --context ${shellQuote(contextDirectory)}`;
}

export async function installCodexHook(options: InstallHookOptions): Promise<void> {
  const config = await loadJson(options.configPath);
  const hooks = (config.hooks as Record<string, unknown> | undefined) ?? {};
  const sessionStart = (hooks.session_start as Record<string, unknown> | undefined) ?? {};

  sessionStart.axi = {
    command: createSessionStartCommand(options.executablePath, options.contextDirectory),
  };
  hooks.session_start = sessionStart;
  config.hooks = hooks;

  await saveJson(options.configPath, config);
}

export async function installClaudeHook(options: InstallHookOptions): Promise<void> {
  const config = await loadJson(options.configPath);
  const hooks = (config.hooks as Record<string, unknown> | undefined) ?? {};

  hooks.sessionStart = [
    {
      name: "axi",
      command: createSessionStartCommand(options.executablePath, options.contextDirectory),
    },
  ];
  config.hooks = hooks;

  await saveJson(options.configPath, config);
}

export async function writeAmbientContext(outputPath: string, value: AxiValue): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${toon(value)}\n`);
}
