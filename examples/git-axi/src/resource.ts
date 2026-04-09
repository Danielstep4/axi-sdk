import { empty, error, truncate, type AxiEnvelope } from "@axi/core";
import { resource } from "@axi/cli";

import {
  createHelp,
  getFileDetail,
  getRepoSummary,
  mapGitError,
  renderExecutablePath,
  toHomeChanges,
} from "./git.js";

const DESCRIPTION = "Inspect local git state with AXI-friendly output";
const EXECUTABLE = "git-axi";
const HOME_HELP = createHelp(EXECUTABLE);

export const gitResource = resource({
  name: "git",
  description: DESCRIPTION,
  home: async (context) => {
    const cwd = getCwd(context.io.cwd);

    try {
      const repo = await getRepoSummary(cwd);
      const response: AxiEnvelope = {
        ok: true,
        kind: "detail",
        bin: EXECUTABLE,
        repo: repo.repoName,
        branch: repo.branch,
        status: repo.status,
        count: repo.entries.length,
        summary: repo.summary,
        changes: toHomeChanges(repo.entries),
        help: HOME_HELP,
      };

      if (context.full) {
        response.description = DESCRIPTION;
        response.root = renderExecutablePath(repo.root);
        response.ahead = repo.ahead;
        response.behind = repo.behind;
      }

      return response;
    } catch (cause) {
      return gitError(cause, cwd);
    }
  },
  list: async (context) => {
    const cwd = getCwd(context.io.cwd);

    try {
      const repo = await getRepoSummary(cwd);

      if (repo.entries.length === 0) {
        return empty("Working tree clean", {
          help: HOME_HELP,
        });
      }

      return {
        ok: true,
        kind: "list",
        count: repo.entries.length,
        changes: repo.entries.map((entry) => ({
          id: entry.path,
          status: entry.status,
          summary: entry.summary,
        })),
      };
    } catch (cause) {
      return gitError(cause, cwd);
    }
  },
  view: async (id, context) => {
    const cwd = getCwd(context.io.cwd);

    try {
      const repo = await getRepoSummary(cwd);
      const file = await getFileDetail(repo, id);

      if (!file) {
        return error(`Path not found in git status: ${id}`, {
          code: "USAGE",
        });
      }

      const response: AxiEnvelope = {
        ok: true,
        kind: "detail",
        id: file.id,
        status: file.status,
        summary: file.summary,
        staged: file.staged,
        unstaged: file.unstaged,
        patch: context.full ? file.patch : truncate(file.patch, 500),
      };

      if (file.previousPath) {
        response.previousPath = file.previousPath;
      }

      if (!context.full) {
        response.help = [`Run \`${EXECUTABLE} view ${id} --full\` for the full patch`];
      }

      return response;
    } catch (cause) {
      return gitError(cause, cwd);
    }
  },
});

function getCwd(cwd: string | undefined): string {
  return cwd ?? process.cwd();
}

function gitError(cause: unknown, cwd: string): AxiEnvelope {
  const mapped = mapGitError(cause, cwd);
  return error(mapped.message, mapped.detail ? { code: mapped.code, detail: mapped.detail } : { code: mapped.code });
}
