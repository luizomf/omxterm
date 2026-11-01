import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { classifyWindowsWrites, assertWindowsInteraction } =
  require("../fixtures/snippets-scenario.cjs") as {
    assertWindowsInteraction(
      writes: string[],
      offset: number,
      insert: string,
      run: string,
    ): unknown;
    classifyWindowsWrites(
      writes: string[],
      offset: number,
    ): { text: string; focus: Array<{ index: number; kind: string }> };
  };

it("retains ordered focus events while the complete interaction has only the exact intended input", () => {
  const writes = [
    "startup",
    "  SNIPPETS_INSERT  ",
    "\u001b[O",
    "\u001b[I",
    "\r",
    "SNIPPETS_RUN",
    "\r",
    "\u001b[O",
    "\u001b[I",
    "\r",
    "SNIPPETS_RUN",
    "\u0003",
    "  SNIPPETS_INSERT  ",
    "\r",
    "SNIPPETS_PING",
    "\r",
  ];
  const original = [...writes];
  const observed = classifyWindowsWrites(writes, 1);
  expect(observed.text).toBe(
    "  SNIPPETS_INSERT  \rSNIPPETS_RUN\r\rSNIPPETS_RUN\u0003  SNIPPETS_INSERT  \rSNIPPETS_PING\r",
  );
  expect(observed.focus).toEqual([
    { index: 2, kind: "out" },
    { index: 3, kind: "in" },
    { index: 7, kind: "out" },
    { index: 8, kind: "in" },
  ]);
  expect(writes).toEqual(original);
});

it("rejects a delayed extra Enter between otherwise exact interaction windows", () => {
  const valid = [
    "  SNIPPETS_INSERT  ",
    "\r",
    "SNIPPETS_RUN",
    "\r",
    "\r",
    "SNIPPETS_RUN",
    "\u0003",
    "  SNIPPETS_INSERT  ",
    "\r",
    "SNIPPETS_PING",
    "\r",
  ];
  expect(() =>
    assertWindowsInteraction(valid, 0, "  SNIPPETS_INSERT  ", "SNIPPETS_RUN"),
  ).not.toThrow();
  const leaked = [...valid.slice(0, 2), "\r", ...valid.slice(2)];
  expect(() =>
    assertWindowsInteraction(leaked, 0, "  SNIPPETS_INSERT  ", "SNIPPETS_RUN"),
  ).toThrow("complete interaction has no extra input");
});

it.each([
  ["\u001b[1;2R"],
  ["\u001b["],
  ["\u001b[Iextra"],
  ["SNIPPETS_RUN\u001b[O"],
  ["\u001b[O\u001b[I"],
])("rejects a non-atomic or unrecognized protocol write %j", (write) => {
  expect(() => classifyWindowsWrites([write], 0)).toThrow(
    "Unexpected PTY protocol write",
  );
});

it.each(["\r\r", "SNIPPETS_RUN\r\r", "SNIPPETS_RUN\n", "SNIPPETS_RU"])(
  "does not classify an extra, duplicate, newline or prefix input %j as an exact Run",
  (data) => {
    expect(classifyWindowsWrites([data, "\u001b[I"], 0).text).not.toBe(
      "SNIPPETS_RUN\r",
    );
  },
);
