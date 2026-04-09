import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), "examples/notes-axi/dist/src/bin/notes-axi.js"), ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}

test("notes example supports empty, create, list, and view flows", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "axi-notes-"));

  const emptyRun = await runCli([], cwd);
  assert.equal(emptyRun.exitCode, 0);
  assert.match(emptyRun.stdout, /kind: empty/);

  const createRun = await runCli(
    ["create", "{\"title\":\"Ship MVP\",\"body\":\"Build the framework\",\"tags\":[\"axi\",\"mvp\"]}"],
    cwd,
  );
  assert.equal(createRun.exitCode, 0);
  assert.match(createRun.stdout, /kind: detail/);
  assert.match(createRun.stdout, /title: "Ship MVP"/);

  const listRun = await runCli(["list"], cwd);
  assert.equal(listRun.exitCode, 0);
  assert.match(listRun.stdout, /kind: list/);

  const viewRun = await runCli(["view", "1", "--full"], cwd);
  assert.equal(viewRun.exitCode, 0);
  assert.match(viewRun.stdout, /body: "Build the framework"/);
  assert.equal(viewRun.stderr, "");
});
