import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSessionStartCommand, installClaudeHook, installCodexHook, writeAmbientContext } from "../src/index.js";

test("createSessionStartCommand uses absolute paths safely", () => {
  assert.equal(
    createSessionStartCommand("/usr/local/bin/notes-axi", "/tmp/project"),
    "\"/usr/local/bin/notes-axi\" hooks session-start --context \"/tmp/project\"",
  );
});

test("installCodexHook is idempotent and repairs stale paths", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "axi-hooks-"));
  const configPath = join(fixtureDir, "codex.json");

  await writeFile(
    configPath,
    `${JSON.stringify({ hooks: { session_start: { axi: { command: "\"/old/bin\" hooks session-start --context \"/old\"" } } } })}\n`,
  );

  await installCodexHook({
    configPath,
    executablePath: "/new/bin/notes-axi",
    contextDirectory: "/workspace/.axi",
  });

  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    hooks: { session_start: { axi: { command: string } } };
  };

  assert.equal(
    config.hooks.session_start.axi.command,
    "\"/new/bin/notes-axi\" hooks session-start --context \"/workspace/.axi\"",
  );
});

test("installClaudeHook writes a compact hook array", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "axi-hooks-"));
  const configPath = join(fixtureDir, "claude.json");

  await installClaudeHook({
    configPath,
    executablePath: "/new/bin/notes-axi",
    contextDirectory: "/workspace/.axi",
  });

  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    hooks: { sessionStart: Array<{ name: string; command: string }> };
  };

  assert.equal(config.hooks.sessionStart[0].name, "axi");
});

test("writeAmbientContext emits TOON", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "axi-hooks-"));
  const outputPath = join(fixtureDir, "ambient.txt");

  await writeAmbientContext(outputPath, { project: "axi", items: 3 });

  const content = await readFile(outputPath, "utf8");

  assert.equal(content, "project: axi\nitems: 3\n");
});
