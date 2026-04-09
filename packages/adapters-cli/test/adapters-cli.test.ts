import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "@axi/cli";

import { runJson, wrapCommand } from "../src/index.js";

function memoryIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
    },
    stdout,
    stderr,
  };
}

test("runJson parses structured backend output", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "axi-run-json-"));
  const scriptPath = join(fixtureDir, "backend.mjs");

  await writeFile(
    scriptPath,
    'process.stdout.write(JSON.stringify([{ "number": 7, "title": "Ship it", "state": "OPEN" }]));\n',
  );

  const value = await runJson(process.execPath, [scriptPath]);

  assert.deepEqual(value, [{ number: 7, title: "Ship it", state: "OPEN" }]);
});

test("wrapCommand narrows backend JSON into an AXI list", async () => {
  const sink = memoryIo();
  const issues = wrapCommand({
    name: "issues",
    description: "Wrapped issues",
    runList: async () => [{ number: 7, title: "Ship it", state: "OPEN", extra: "hidden" }],
    mapList: (rows) =>
      rows.map((row) => ({
        id: row.number,
        title: row.title,
        status: row.state.toLowerCase(),
      })),
  });

  const exitCode = await run(issues, { argv: ["list"], io: sink.io });

  assert.equal(exitCode, 0);
  assert.match(sink.stdout.join(""), /items\[1\]\{id,title,status\}:/);
  assert.match(sink.stdout.join(""), /7,"Ship it",open/);
  assert.doesNotMatch(sink.stdout.join(""), /hidden/);
});

test("wrapCommand translates backend failures", async () => {
  const sink = memoryIo();
  const issues = wrapCommand({
    name: "issues",
    description: "Wrapped issues",
    runList: async () => {
      throw new Error("backend exploded");
    },
    mapError: () => ({
      ok: false,
      kind: "error",
      message: "The issue backend is unavailable",
      code: "BACKEND",
    }),
  });

  const exitCode = await run(issues, { argv: ["list"], io: sink.io });

  assert.equal(exitCode, 0);
  assert.match(sink.stdout.join(""), /The issue backend is unavailable/);
});
