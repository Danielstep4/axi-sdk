# Real Examples

This file shows concrete examples from the current MVP.

## 1. A real AXI resource

The notes example is implemented in [`examples/notes-axi/src/resource.ts`](./examples/notes-axi/src/resource.ts):

```ts
import { empty, noop } from "@axi/core";
import { resource } from "@axi/cli";

import { createNote, getNote, listNotes, updateNote } from "./store.js";

export const notesResource = resource({
  name: "notes",
  description: "Manage notes in the current workspace",
  home: async (context) => {
    const notes = await listNotes(context.io.cwd ?? process.cwd());

    if (notes.length === 0) {
      return empty("No notes yet", {
        hint: "Use create with a JSON payload to add one",
      });
    }

    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      status: "saved",
      updatedAt: note.updatedAt,
    }));
  },
  list: async (context) => {
    const notes = await listNotes(context.io.cwd ?? process.cwd());

    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      status: "saved",
      updatedAt: note.updatedAt,
    }));
  },
  view: async (id, context) => getNote(context.io.cwd ?? process.cwd(), id),
  create: async (input, context) => createNote(context.io.cwd ?? process.cwd(), input),
  update: async (id, input, context) => {
    const before = await getNote(context.io.cwd ?? process.cwd(), id);
    const after = await updateNote(context.io.cwd ?? process.cwd(), id, input);

    if (JSON.stringify(before) === JSON.stringify(after)) {
      return noop(`Note ${id} was already up to date`);
    }

    return after;
  },
});
```

## 2. Real CLI output

These commands were run against the built example CLI at [`examples/notes-axi/src/bin/notes-axi.ts`](./examples/notes-axi/src/bin/notes-axi.ts).

Empty workspace:

```bash
node examples/notes-axi/dist/src/bin/notes-axi.js
```

```text
ok: true
kind: empty
message: "No notes yet"
hint: "Use create with a JSON payload to add one"
```

Create a note:

```bash
node examples/notes-axi/dist/src/bin/notes-axi.js create '{"title":"Ship MVP","body":"Build the framework","tags":["axi","mvp"]}'
```

```text
ok: true
kind: detail
full: false
item:
  id: 1
  title: "Ship MVP"
  updatedAt: 2026-04-09T19:45:22.062Z
  createdAt: 2026-04-09T19:45:22.062Z
  body: "Build the framework"
  tags:
    - axi
    - mvp
```

List notes:

```bash
node examples/notes-axi/dist/src/bin/notes-axi.js list
```

```text
ok: true
kind: list
count: 1
fields:
  - id
  - title
  - status
  - updatedAt
items:
  - id: 1
    title: "Ship MVP"
    status: saved
    updatedAt: 2026-04-09T19:45:22.062Z
```

View full detail:

```bash
node examples/notes-axi/dist/src/bin/notes-axi.js view 1 --full
```

```text
ok: true
kind: detail
full: true
item:
  id: 1
  title: "Ship MVP"
  body: "Build the framework"
  tags:
    - axi
    - mvp
  createdAt: 2026-04-09T19:45:22.062Z
  updatedAt: 2026-04-09T19:45:22.062Z
```

## 3. A real existing-CLI wrapper

From [`packages/adapters-cli/src/index.ts`](./packages/adapters-cli/src/index.ts), the intended pattern is:

```ts
import { runJson, wrapCommand } from "@axi/adapters-cli";

export const issuesResource = wrapCommand({
  name: "issues",
  description: "Wrapped GitHub issues",
  runList: async () =>
    (await runJson("gh", [
      "issue",
      "list",
      "--json",
      "number,title,state",
    ])) as Array<{ number: number; title: string; state: string }>,
  mapList: (rows) =>
    rows.map((row) => ({
      id: row.number,
      title: row.title,
      status: row.state.toLowerCase(),
    })),
});
```

That turns verbose backend JSON into the compact AXI list shape:

```text
ok: true
kind: list
count: 2
fields:
  - id
  - title
  - status
items:
  - id: 17
    title: "Fix auth redirect"
    status: open
  - id: 18
    title: "Document CLI flags"
    status: closed
```

## 4. A real MCP wrapper

From [`packages/adapters-mcp/src/index.ts`](./packages/adapters-mcp/src/index.ts):

```ts
import { wrapMcpResource } from "@axi/adapters-mcp";

export const tasksResource = wrapMcpResource({
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
```

## 5. A real hook command

From [`packages/hooks/src/index.ts`](./packages/hooks/src/index.ts):

```ts
import { createSessionStartCommand } from "@axi/hooks";

const command = createSessionStartCommand(
  "/usr/local/bin/notes-axi",
  "/workspace/.axi",
);
```

Result:

```text
"/usr/local/bin/notes-axi" hooks session-start --context "/workspace/.axi"
```
