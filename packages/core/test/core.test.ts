import test from "node:test";
import assert from "node:assert/strict";

import { detail, error, list, noop, toon, truncate } from "../src/index.js";

test("list picks a compact default schema", () => {
  const output = list([
    {
      id: "n1",
      title: "First note",
      status: "open",
      summary: "A concise summary",
      body: "This field should be omitted by default",
    },
  ]);

  assert.deepEqual(output.fields, ["id", "title", "status", "summary"]);
  assert.equal(
    toon(output),
    [
      "ok: true",
      "kind: list",
      "count: 1",
      "items[1]{id,title,status,summary}:",
      "  n1,\"First note\",open,\"A concise summary\"",
    ].join("\n"),
  );
});

test("detail supports truncation and full output", () => {
  const short = detail(
    {
      id: "n1",
      title: "First note",
      body: "x".repeat(40),
      tags: ["cli", "axi"],
    },
    { fields: ["id", "body"], truncate: 18 },
  );

  const full = detail(
    {
      id: "n1",
      title: "First note",
      body: "full body",
      tags: ["cli", "axi"],
    },
    { full: true },
  );

  assert.equal((short.item as Record<string, string>).body, "xxxxxxxxxxxxxxx...");
  assert.deepEqual(full.item, {
    id: "n1",
    title: "First note",
    body: "full body",
    tags: ["cli", "axi"],
  });
  assert.equal(
    toon(full),
    [
      "ok: true",
      "kind: detail",
      "full: true",
      "id: n1",
      "title: \"First note\"",
      "body: \"full body\"",
      "tags[2]:",
      "  cli",
      "  axi",
    ].join("\n"),
  );
});

test("error and noop are explicit envelopes", () => {
  assert.equal(
    toon(error("Bad input", { code: "USAGE", field: "title" })),
    ["ok: false", "kind: error", "message: \"Bad input\"", "code: USAGE", "field: title"].join("\n"),
  );

  assert.equal(
    toon(noop("Nothing changed", { reason: "already-current" })),
    ["ok: true", "kind: noop", "message: \"Nothing changed\"", "reason: already-current"].join("\n"),
  );
});

test("truncate preserves short strings", () => {
  assert.equal(truncate("short", 10), "short");
  assert.equal(truncate("1234567890", 7), "1234...");
});
