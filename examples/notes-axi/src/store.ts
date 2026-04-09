import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function storagePath(cwd: string): string {
  return join(cwd, ".axi-notes.json");
}

async function readNotes(cwd: string): Promise<Note[]> {
  try {
    const raw = await readFile(storagePath(cwd), "utf8");
    return JSON.parse(raw) as Note[];
  } catch {
    return [];
  }
}

async function writeNotes(cwd: string, notes: Note[]): Promise<void> {
  await writeFile(storagePath(cwd), `${JSON.stringify(notes, null, 2)}\n`);
}

export async function listNotes(cwd: string): Promise<Note[]> {
  const notes = await readNotes(cwd);
  return notes.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getNote(cwd: string, id: string): Promise<Note> {
  const notes = await readNotes(cwd);
  const note = notes.find((entry) => entry.id === id);

  if (!note) {
    throw new Error(`Note ${id} was not found`);
  }

  return note;
}

export async function createNote(cwd: string, input: unknown): Promise<Note> {
  const payload = input as Partial<Pick<Note, "title" | "body" | "tags">>;

  if (!payload.title || !payload.body) {
    throw new Error("Notes require both title and body");
  }

  const notes = await readNotes(cwd);
  const now = new Date().toISOString();
  const note: Note = {
    id: String(notes.length + 1),
    title: payload.title,
    body: payload.body,
    tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
    createdAt: now,
    updatedAt: now,
  };

  notes.push(note);
  await writeNotes(cwd, notes);
  return note;
}

export async function updateNote(cwd: string, id: string, input: unknown): Promise<Note> {
  const payload = input as Partial<Pick<Note, "title" | "body" | "tags">>;
  const notes = await readNotes(cwd);
  const index = notes.findIndex((entry) => entry.id === id);

  if (index === -1) {
    throw new Error(`Note ${id} was not found`);
  }

  const existing = notes[index];
  const updated: Note = {
    ...existing,
    title: payload.title ?? existing.title,
    body: payload.body ?? existing.body,
    tags: Array.isArray(payload.tags) ? payload.tags.map(String) : existing.tags,
    updatedAt: new Date().toISOString(),
  };

  notes[index] = updated;
  await writeNotes(cwd, notes);
  return updated;
}
