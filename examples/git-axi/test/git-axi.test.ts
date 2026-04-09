import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), "examples/git-axi/dist/src/bin/git-axi.js"), ...args], {
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

async function runGit(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function createRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "axi-git-"));

  await runGit(["init"], cwd);
  await runGit(["config", "user.name", "AXI Test"], cwd);
  await runGit(["config", "user.email", "axi@example.com"], cwd);
  await writeFile(join(cwd, "README.md"), "hello\n");
  await runGit(["add", "README.md"], cwd);
  await runGit(["commit", "-m", "init"], cwd);

  return cwd;
}

test("git example shows a clean dashboard by default", async () => {
  const cwd = await createRepo();
  const result = await runCli([], cwd);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /kind: detail/);
  assert.match(result.stdout, /status: clean/);
  assert.match(result.stdout, /summary: "working tree clean"/);
});

test("git example returns an empty state for a clean list", async () => {
  const cwd = await createRepo();
  const result = await runCli(["list"], cwd);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /kind: empty/);
  assert.match(result.stdout, /message: "Working tree clean"/);
});

test("git example lists modified tracked files", async () => {
  const cwd = await createRepo();

  await writeFile(join(cwd, "README.md"), "hello\nworld\n");

  const result = await runCli(["list"], cwd);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /kind: list/);
  assert.match(result.stdout, /changes\[1\]\{id,status,summary\}:/);
  assert.match(result.stdout, /README\.md,modified,unstaged/);
});

test("git example shows staged and unstaged changes for the same file", async () => {
  const cwd = await createRepo();

  await writeFile(join(cwd, "README.md"), "hello\nstaged\n");
  await runGit(["add", "README.md"], cwd);
  await writeFile(join(cwd, "README.md"), "hello\nstaged\nunstaged\n");

  const listResult = await runCli(["list"], cwd);
  const viewResult = await runCli(["view", "README.md", "--full"], cwd);

  assert.equal(listResult.exitCode, 0);
  assert.match(listResult.stdout, /README\.md,modified,both/);

  assert.equal(viewResult.exitCode, 0);
  assert.match(viewResult.stdout, /staged: "\+1\/-0"/);
  assert.match(viewResult.stdout, /unstaged: "\+1\/-0"/);
  assert.match(viewResult.stdout, /patch: "# staged/);
  assert.match(viewResult.stdout, /# unstaged/);
});

test("git example reports untracked files", async () => {
  const cwd = await createRepo();

  await writeFile(join(cwd, "draft.txt"), "draft\n");

  const result = await runCli(["view", "draft.txt"], cwd);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /status: untracked/);
  assert.match(result.stdout, /summary: unstaged/);
  assert.match(result.stdout, /patch:/);
});

test("git example returns a structured error outside a repository", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "axi-git-outside-"));
  const result = await runCli([], cwd);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /kind: error/);
  assert.match(result.stdout, /No git repository found/);
});
