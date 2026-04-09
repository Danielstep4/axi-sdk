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
