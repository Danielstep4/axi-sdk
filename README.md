# axi-sdk

TypeScript SDK for building AXI-native CLIs, wrapping existing JSON or MCP backends in AXI, and integrating those tools into agent environments.

## What this repo is

`axi-sdk` is a small monorepo with a few focused packages:

- `@axi/core`: AXI envelopes, compact field selection, truncation, and TOON rendering
- `@axi/cli`: a plain Node CLI runtime for `list`, `view`, `create`, and `update` flows
- `@axi/adapters-cli`: wrappers for existing JSON-returning CLIs
- `@axi/adapters-mcp`: wrappers for MCP-style tool execution
- `@axi/hooks`: minimal session-start hook and ambient-context helpers

The goal is simple: make AXI cheap to adopt.

You can use it in two ways:

1. Build a new AXI-native CLI directly.
2. Put a clean AXI layer in front of an existing backend.

## Quick Start

Install dependencies:

```bash
npm install
```

Run the test suite:

```bash
npm test
```

Run the example CLI:

```bash
npm run example -- list
```

Run the git example CLI:

```bash
npm run example:git -- list
```

## Small Example

This is the basic shape of a CLI built with `@axi/cli`:

```ts
import { resource, run } from "@axi/cli";

const notes = resource({
  name: "notes",
  description: "Manage notes in the current workspace",
  list: async () => [
    {
      id: "1",
      title: "Ship MVP",
      status: "saved",
      updatedAt: "2026-04-09T19:45:22.062Z",
    },
  ],
  view: async (id) => ({
    id,
    title: "Ship MVP",
    body: "Build the framework",
  }),
});

const exitCode = await run(notes);
process.exitCode = exitCode;
```

Example output:

```text
ok: true
kind: list
count: 1
items[1]{id,title,status,updatedAt}:
  1,"Ship MVP",saved,2026-04-09T19:45:22.062Z
```

## Package Guide

### `@axi/core`

Use this when you already have plain JavaScript objects and just need AXI-shaped output.

Main exports:

- `list(items, options)`
- `detail(item, options)`
- `empty(message, options?)`
- `error(message, options?)`
- `noop(message, options?)`
- `toon(value)`
- `truncate(value, maxChars)`

### `@axi/cli`

Use this when you are building a real CLI.

Main exports:

- `resource(definition)`
- `run(resource, options?)`

Your handlers can return:

- arrays for list responses
- objects for detail responses
- explicit AXI envelopes when you need full control

### `@axi/adapters-cli`

Use this when a backend CLI already exists and can return JSON.

Main exports:

- `runJson(command, args, options?)`
- `wrapCommand(options)`

Typical flow:

1. Call the backend CLI.
2. Parse its JSON.
3. Map it into a smaller AXI list/detail shape.

### `@axi/adapters-mcp`

Use this when your backend is an MCP tool or MCP-like executor.

Main export:

- `wrapMcpResource(options)`

You provide:

- `execute(tool, input)`
- optional `listTool` and `detailTool`
- mapping functions to convert backend output into AXI output

### `@axi/hooks`

Use this when you want the CLI to integrate into agent environments.

Main exports:

- `createSessionStartCommand(executablePath, contextDirectory)`
- `installCodexHook(options)`
- `installClaudeHook(options)`
- `writeAmbientContext(outputPath, value)`

## Real Example App

The repo includes a complete example CLI:

- [`examples/notes-axi/src/resource.ts`](./examples/notes-axi/src/resource.ts)
- [`examples/notes-axi/src/bin/notes-axi.ts`](./examples/notes-axi/src/bin/notes-axi.ts)
- [`examples/git-axi/src/resource.ts`](./examples/git-axi/src/resource.ts)
- [`examples/git-axi/src/bin/git-axi.ts`](./examples/git-axi/src/bin/git-axi.ts)

It shows:

- empty states
- create/list/view flows
- compact list output
- `--full` detail output
- file-backed local storage
- wrapped `git` command output shaped into AXI

## More Examples

For concrete command output and package-level examples, see:

- [`REAL_EXAMPLES.md`](./REAL_EXAMPLES.md)

## Repo Layout

```text
packages/
  core/
  cli/
  adapters-cli/
  adapters-mcp/
  hooks/
examples/
  notes-axi/
```

## Current Scope

This repo is intentionally small.

- The CLI layer is dependency-free and plain Node.
- TOON is implemented here as a deterministic, human-readable serializer.
- The packages are designed to prove the AXI developer experience before adding more framework surface.
