import test from "node:test";
import assert from "node:assert/strict";

import { resource, run } from "../src/index.js";

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

test("run renders home on no-arg invocation", async () => {
  const sink = memoryIo();
  const notes = resource({
    name: "notes",
    description: "Workspace notes",
    home: () => [{ id: "n1", title: "First note", status: "open", summary: "Hello" }],
  });

  const exitCode = await run(notes, { argv: [], io: sink.io });

  assert.equal(exitCode, 0);
  assert.match(sink.stdout.join(""), /kind: list/);
  assert.equal(sink.stderr.join(""), "");
});

test("help stays off stdout", async () => {
  const sink = memoryIo();
  const notes = resource({
    name: "notes",
    description: "Workspace notes",
    list: () => [],
  });

  const exitCode = await run(notes, { argv: ["--help"], io: sink.io });

  assert.equal(exitCode, 0);
  assert.equal(sink.stdout.join(""), "");
  assert.match(sink.stderr.join(""), /Commands:/);
});

test("usage errors produce structured output", async () => {
  const sink = memoryIo();
  const notes = resource({
    name: "notes",
    description: "Workspace notes",
    list: () => [],
  });

  const exitCode = await run(notes, { argv: ["view"], io: sink.io });

  assert.equal(exitCode, 2);
  assert.match(sink.stdout.join(""), /kind: error/);
  assert.match(sink.stdout.join(""), /code: USAGE/);
});
