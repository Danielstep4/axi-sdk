import test from "node:test";
import assert from "node:assert/strict";

import { run } from "@axi/cli";

import { wrapMcpResource } from "../src/index.js";

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

test("wrapMcpResource adapts MCP output into compact AXI output", async () => {
  const sink = memoryIo();
  const resource = wrapMcpResource({
    name: "tasks",
    description: "MCP tasks",
    listTool: "task.list",
    detailTool: "task.get",
    execute: async (tool, input) => {
      if (tool === "task.list") {
        return [{ uuid: "t1", label: "Write docs", state: "open", verbose: "ignore me" }];
      }

      return { uuid: (input as { id: string }).id, label: "Write docs", body: "Full detail" };
    },
    mapList: (result) =>
      (result as Array<{ uuid: string; label: string; state: string }>).map((task) => ({
        id: task.uuid,
        title: task.label,
        status: task.state,
      })),
    mapDetail: (result) => {
      const task = result as { uuid: string; label: string; body: string };
      return { id: task.uuid, title: task.label, body: task.body };
    },
  });

  const listExitCode = await run(resource, { argv: ["list"], io: sink.io });

  assert.equal(listExitCode, 0);
  assert.match(sink.stdout.join(""), /kind: list/);
  assert.match(sink.stdout.join(""), /title: "Write docs"/);
});

test("wrapMcpResource maps backend failures", async () => {
  const sink = memoryIo();
  const resource = wrapMcpResource({
    name: "tasks",
    description: "MCP tasks",
    listTool: "task.list",
    execute: async () => {
      throw new Error("socket closed");
    },
  });

  const exitCode = await run(resource, { argv: ["list"], io: sink.io });

  assert.equal(exitCode, 0);
  assert.match(sink.stdout.join(""), /code: MCP/);
});
