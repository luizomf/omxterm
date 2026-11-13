// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

it("reads a pane's screen for an agent, and fails when the Surface has none", async () => {
  const harness = createTabsHarness();
  await harness.tabs.ready;
  const surface = harness.surfaces[0]!;
  const screen = { source: "screen" } as const;
  expect(harness.tabs.readSession("a", "s1", screen)).toEqual({
    id: "a",
    error: "failed",
  });
  const readScreen = vi.fn((): string | undefined => "$ ls  \n\nfile ");
  Object.assign(surface, { readScreen });
  expect(harness.tabs.readSession("b", "s1", screen)).toMatchObject({
    id: "b",
    text: "$ ls\n\nfile",
    truncated: false,
  });
  readScreen.mockReturnValueOnce(undefined);
  expect(harness.tabs.readSession("c", "s1", screen)).toEqual({
    id: "c",
    error: "failed",
  });
  // The tail still reads the exported content.
  surface.exportText.mockReturnValueOnce("one\ntwo\n\n");
  expect(
    harness.tabs.readSession("d", "s1", { source: "tail", lines: 1 }),
  ).toMatchObject({ id: "d", text: "two", truncated: false });
});
