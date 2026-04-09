import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 1024 * 1024 * 4;

export interface GitStatusEntry {
  path: string;
  previousPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  status: string;
  summary: "staged" | "unstaged" | "both";
}

export interface GitRepoSummary {
  root: string;
  repoName: string;
  branch: string;
  ahead: number;
  behind: number;
  status: "clean" | "dirty";
  summary: string;
  entries: GitStatusEntry[];
  counts: {
    staged: number;
    unstaged: number;
    untracked: number;
    conflicted: number;
  };
}

export interface GitDiffStat {
  added: number | null;
  deleted: number | null;
}

export interface GitFileDetail {
  id: string;
  status: string;
  summary: "staged" | "unstaged" | "both";
  previousPath?: string;
  staged: string;
  unstaged: string;
  patch: string;
}

interface ExecFileError extends Error {
  code?: number | string | null;
  stderr?: string;
  stdout?: string;
}

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly code: number | string | null,
    readonly stderr: string,
    readonly stdout: string,
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

export async function resolveGitRoot(cwd: string): Promise<string> {
  return (await runGit(["rev-parse", "--show-toplevel"], cwd)).trim();
}

export async function getRepoSummary(cwd: string): Promise<GitRepoSummary> {
  const root = await resolveGitRoot(cwd);
  const output = await runGit(["status", "--porcelain=v2", "--branch"], root);
  const branch = parseBranch(output);
  const aheadBehind = parseAheadBehind(output);
  const entries = parseStatus(output);
  const counts = summarize(entries);

  return {
    root,
    repoName: basename(root),
    branch,
    ahead: aheadBehind.ahead,
    behind: aheadBehind.behind,
    status: entries.length === 0 ? "clean" : "dirty",
    summary: formatRepoSummary(counts),
    entries,
    counts,
  };
}

export async function getFileDetail(repo: GitRepoSummary, path: string): Promise<GitFileDetail | undefined> {
  const entry = repo.entries.find((candidate) => candidate.path === path);

  if (!entry) {
    return undefined;
  }

  const stagedPatch = hasIndexChanges(entry) ? await getPatch(repo.root, path, "staged") : "";
  const unstagedPatch = hasWorktreeChanges(entry) ? await getPatch(repo.root, path, "unstaged") : "";
  const stagedStat = hasIndexChanges(entry) ? await getNumstat(repo.root, path, "staged") : null;
  const unstagedStat = hasWorktreeChanges(entry) ? await getNumstat(repo.root, path, "unstaged") : null;

  return {
    id: entry.path,
    status: entry.status,
    summary: entry.summary,
    previousPath: entry.previousPath,
    staged: formatDiffStat(stagedStat),
    unstaged: formatDiffStat(unstagedStat),
    patch: combinePatchPreview(stagedPatch, unstagedPatch),
  };
}

export function renderExecutablePath(path: string): string {
  const home = homedir();

  if (path.startsWith(`${home}/`)) {
    return `~/${relative(home, path)}`;
  }

  return path;
}

export function toHomeChanges(entries: GitStatusEntry[]): Array<{ path: string; status: string; summary: string }> {
  return entries.slice(0, 5).map((entry) => ({
    path: entry.path,
    status: entry.status,
    summary: entry.summary,
  }));
}

export function createHelp(executable: string): string[] {
  return [
    `Run \`${executable} list\` to inspect changed files`,
    `Run \`${executable} view <path> --full\` to inspect one patch`,
  ];
}

export function mapGitError(cause: unknown, cwd: string): { message: string; code: string; detail?: string } {
  if (cause instanceof GitCommandError) {
    const detail = cause.stderr.trim() || cause.stdout.trim() || cause.message;

    if (detail.includes("not a git repository")) {
      return {
        message: `No git repository found at ${cwd}`,
        code: "BACKEND",
      };
    }

    if (detail.includes("unknown revision or path")) {
      return {
        message: "The requested path does not exist in this repository state",
        code: "BACKEND",
        detail,
      };
    }

    if (detail.includes("No such file or directory")) {
      return {
        message: "The requested file is no longer present in the working tree",
        code: "BACKEND",
        detail,
      };
    }

    return {
      message: "Git command failed",
      code: "BACKEND",
      detail,
    };
  }

  if (cause instanceof Error) {
    return {
      message: cause.message,
      code: "BACKEND",
    };
  }

  return {
    message: "Git command failed",
    code: "BACKEND",
  };
}

async function getPatch(root: string, path: string, mode: "staged" | "unstaged"): Promise<string> {
  if (mode === "staged") {
    return runGit(["diff", "--cached", "--", path], root, [0, 1]);
  }

  const untracked = await maybeReadUntrackedPatch(root, path);

  if (untracked) {
    return untracked;
  }

  return runGit(["diff", "--", path], root, [0, 1]);
}

async function getNumstat(root: string, path: string, mode: "staged" | "unstaged"): Promise<GitDiffStat | null> {
  const args = mode === "staged" ? ["diff", "--cached", "--numstat", "--", path] : ["diff", "--numstat", "--", path];
  const output = (await runGit(args, root, [0, 1])).trim();

  if (!output) {
    return null;
  }

  const line = output.split("\n")[0] ?? "";
  const [addedRaw, deletedRaw] = line.split("\t");

  return {
    added: parseNumstatValue(addedRaw),
    deleted: parseNumstatValue(deletedRaw),
  };
}

async function maybeReadUntrackedPatch(root: string, path: string): Promise<string | undefined> {
  const absolutePath = join(root, path);

  try {
    await access(absolutePath);
  } catch {
    return undefined;
  }

  const patch = await runGit(["diff", "--no-index", "--", "/dev/null", absolutePath], root, [0, 1]);
  return normalizeNoIndexPatch(patch, absolutePath, path);
}

async function runGit(args: string[], cwd: string, allowedExitCodes: number[] = [0]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: MAX_BUFFER,
    });
    return stdout;
  } catch (error) {
    const cause = error as ExecFileError;
    const code = typeof cause.code === "number" ? cause.code : null;

    if (code !== null && allowedExitCodes.includes(code)) {
      return cause.stdout ?? "";
    }

    const stderr = cause.stderr ?? "";
    const stdout = cause.stdout ?? "";
    const message = stderr.trim() || stdout.trim() || cause.message;

    throw new GitCommandError(message, cause.code ?? null, stderr, stdout);
  }
}

function parseBranch(output: string): string {
  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.head ")) {
      const branch = line.slice("# branch.head ".length).trim();
      return branch === "(detached)" ? "detached" : branch;
    }
  }

  return "unknown";
}

function parseAheadBehind(output: string): { ahead: number; behind: number } {
  for (const line of output.split("\n")) {
    if (!line.startsWith("# branch.ab ")) {
      continue;
    }

    const match = /^# branch\.ab \+(?<ahead>\d+) -(?<behind>\d+)$/.exec(line.trim());

    return {
      ahead: Number(match?.groups?.ahead ?? 0),
      behind: Number(match?.groups?.behind ?? 0),
    };
  }

  return { ahead: 0, behind: 0 };
}

function parseStatus(output: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];

  for (const line of output.split("\n")) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith("? ")) {
      const path = line.slice(2);
      entries.push({
        path,
        indexStatus: ".",
        worktreeStatus: "?",
        status: "untracked",
        summary: "unstaged",
      });
      continue;
    }

    if (line.startsWith("1 ")) {
      const match = /^1 (?<xy>\S{2}) \S+ \S+ \S+ \S+ \S+ \S+ (?<path>.+)$/.exec(line);

      if (!match?.groups) {
        continue;
      }

      entries.push(createEntry(match.groups.path, undefined, match.groups.xy));
      continue;
    }

    if (line.startsWith("2 ")) {
      const match = /^2 (?<xy>\S{2}) \S+ \S+ \S+ \S+ \S+ \S+ \S+ (?<path>[^\t]+)\t(?<previousPath>.+)$/.exec(line);

      if (!match?.groups) {
        continue;
      }

      entries.push(createEntry(match.groups.path, match.groups.previousPath, match.groups.xy));
      continue;
    }

    if (line.startsWith("u ")) {
      const match = /^u (?<xy>\S{2}) (?:\S+ ){8}(?<path>.+)$/.exec(line);

      if (!match?.groups) {
        continue;
      }

      entries.push({
        path: match.groups.path,
        indexStatus: "U",
        worktreeStatus: "U",
        status: "conflicted",
        summary: "both",
      });
    }
  }

  return entries;
}

function createEntry(path: string, previousPath: string | undefined, xy: string): GitStatusEntry {
  const indexStatus = xy[0] ?? ".";
  const worktreeStatus = xy[1] ?? ".";
  const status = normalizeStatus(indexStatus, worktreeStatus, previousPath);

  return {
    path,
    previousPath,
    indexStatus,
    worktreeStatus,
    status,
    summary: summarizeEntry(indexStatus, worktreeStatus),
  };
}

function normalizeStatus(indexStatus: string, worktreeStatus: string, previousPath?: string): string {
  if (indexStatus === "U" || worktreeStatus === "U") {
    return "conflicted";
  }

  if (worktreeStatus === "?") {
    return "untracked";
  }

  if (previousPath || indexStatus === "R" || worktreeStatus === "R") {
    return "renamed";
  }

  if (indexStatus === "D" || worktreeStatus === "D") {
    return "deleted";
  }

  if (indexStatus === "A" || worktreeStatus === "A") {
    return "added";
  }

  return "modified";
}

function summarizeEntry(indexStatus: string, worktreeStatus: string): "staged" | "unstaged" | "both" {
  const indexChanged = indexStatus !== "." && indexStatus !== "?";
  const worktreeChanged = worktreeStatus !== "." && worktreeStatus !== "?";

  if (indexChanged && worktreeChanged) {
    return "both";
  }

  if (indexChanged) {
    return "staged";
  }

  return "unstaged";
}

function summarize(entries: GitStatusEntry[]): GitRepoSummary["counts"] {
  const counts = {
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
  };

  for (const entry of entries) {
    if (entry.summary === "staged" || entry.summary === "both") {
      counts.staged += 1;
    }

    if (entry.summary === "unstaged" || entry.summary === "both") {
      counts.unstaged += 1;
    }

    if (entry.status === "untracked") {
      counts.untracked += 1;
    }

    if (entry.status === "conflicted") {
      counts.conflicted += 1;
    }
  }

  return counts;
}

function formatRepoSummary(counts: GitRepoSummary["counts"]): string {
  if (counts.staged === 0 && counts.unstaged === 0 && counts.untracked === 0 && counts.conflicted === 0) {
    return "working tree clean";
  }

  const parts = [`${counts.staged} staged`, `${counts.unstaged} unstaged`];

  if (counts.untracked > 0) {
    parts.push(`${counts.untracked} untracked`);
  }

  if (counts.conflicted > 0) {
    parts.push(`${counts.conflicted} conflicted`);
  }

  return parts.join(", ");
}

function hasIndexChanges(entry: GitStatusEntry): boolean {
  return entry.indexStatus !== "." && entry.indexStatus !== "?";
}

function hasWorktreeChanges(entry: GitStatusEntry): boolean {
  return entry.worktreeStatus !== "." || entry.status === "untracked";
}

function parseNumstatValue(value: string | undefined): number | null {
  if (!value || value === "-") {
    return null;
  }

  return Number(value);
}

function formatDiffStat(stat: GitDiffStat | null): string {
  if (!stat) {
    return "none";
  }

  const added = stat.added === null ? "binary" : `+${stat.added}`;
  const deleted = stat.deleted === null ? "binary" : `-${stat.deleted}`;
  return `${added}/${deleted}`;
}

function combinePatchPreview(stagedPatch: string, unstagedPatch: string): string {
  if (stagedPatch && unstagedPatch) {
    return `# staged\n${stagedPatch.trim()}\n\n# unstaged\n${unstagedPatch.trim()}`;
  }

  return stagedPatch || unstagedPatch || "No patch available";
}

function normalizeNoIndexPatch(patch: string, absolutePath: string, relativePath: string): string {
  return patch
    .split(absolutePath)
    .join(relativePath)
    .split(absolutePath.slice(1))
    .join(relativePath);
}
