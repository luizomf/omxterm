// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTabsHarness,
  dragTabTo,
  selectedStates,
} from "../fixtures/terminal-tabs-harness";

const harnesses: ReturnType<typeof createTabsHarness>[] = [];
afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.tabs.dispose();
  vi.restoreAllMocks();
});

async function threeTabs() {
  const harness = createTabsHarness();
  harnesses.push(harness);
  await harness.tabs.ready;
  for (const count of [2, 3]) {
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(count));
  }
  for (const [index, label] of ["A", "B", "C"].entries())
    harness.tabs.setSessionTitle(`s${index + 1}`, label);
  return harness;
}

function expectRouting(
  harness: ReturnType<typeof createTabsHarness>,
  selected: number,
) {
  harness.tabs.clipboardAction("paste");
  harness.tabs.injectSnippet("synthetic snippet", { submit: true });
  harness.tabs.focusSelected();
  for (const [index, surface] of harness.surfaces.entries()) {
    expect(surface.paste).toHaveBeenCalledTimes(index === selected ? 1 : 0);
    expect(surface.inject).toHaveBeenCalledTimes(index === selected ? 1 : 0);
  }
  expect(harness.surfaces[selected]!.inject).toHaveBeenCalledWith(
    "synthetic snippet",
    { submit: true },
  );
  expect(harness.notifySelection).toHaveBeenLastCalledWith(`s${selected + 1}`);
  expect(harness.surfaces[selected]!.focus).toHaveBeenCalled();
  expect(harness.surfaces[selected]!.dispose).not.toHaveBeenCalled();
  expect(harness.adapters[selected]!.close).not.toHaveBeenCalled();
  expect(harness.mount).toHaveBeenCalledTimes(3);
}

describe("Terminal Tab removal preserves selected identity", () => {
  it("A/B/C: ordinary C exit then Paste still targets A's Surface and session", async () => {
    const harness = await threeTabs();
    harness.tabs.handleCommand({ action: "select", position: 1 });
    const selectedContainer = harness.container.children[0];
    expect(selectedStates(harness.strip)).toEqual([
      "A:true",
      "B:false",
      "C:false",
    ]);

    harness.adapters[2]!.handlers!.onExit({ exitCode: 0, signal: 0 });
    // Route before asserting so a failure reports both identity and recipient.
    expectRouting(harness, 0);
    expect(selectedStates(harness.strip)).toEqual(["A:true", "B:false"]);
    // A Terminal Tab wraps its pane Surfaces; only the selected one is shown.
    expect(harness.container.querySelector("main:not([hidden])")).toBe(
      selectedContainer!.querySelector("main"),
    );
  });

  it.each(["exit", "close"] as const)(
    "preserves selection after background %s before it",
    async (kind) => {
      const harness = await threeTabs();
      harness.tabs.handleCommand({ action: "select", position: 2 });
      if (kind === "exit")
        harness.adapters[0]!.handlers!.onExit({ exitCode: 7, signal: 0 });
      else
        harness.tabs.handleCommand({
          action: "close-session",
          sessionId: "s1",
        });
      expect(selectedStates(harness.strip)).toEqual(["B:true", "C:false"]);
      expectRouting(harness, 1);
      harness.tabs.handleCommand({ action: "next" });
      expect(selectedStates(harness.strip)).toEqual(["B:false", "C:true"]);
      harness.tabs.handleCommand({ action: "previous" });
      expect(selectedStates(harness.strip)).toEqual(["B:true", "C:false"]);
    },
  );

  it("keeps A selected when a retained close removes C after selection changed", async () => {
    const harness = await threeTabs();
    harness.tabs.handleCommand({ action: "prepare-close" });
    harness.tabs.handleCommand({ action: "select", position: 1 });
    harness.tabs.handleCommand({ action: "resolve-close", confirmed: true });
    expectRouting(harness, 0);
    expect(selectedStates(harness.strip)).toEqual(["A:true", "B:false"]);
    expect(harness.surfaces[2]!.dispose).toHaveBeenCalledOnce();
  });

  it("uses current reordered identities rather than creation positions", async () => {
    const harness = await threeTabs();
    // C/A/B, select C, then B exits to its right.
    dragTabTo(harness.strip, 2, 0);
    harness.adapters[1]!.handlers!.onExit({ exitCode: 0, signal: 0 });
    expectRouting(harness, 2);
    expect(selectedStates(harness.strip)).toEqual(["C:true", "A:false"]);
    harness.tabs.handleCommand({ action: "next" });
    expect(selectedStates(harness.strip)).toEqual(["C:false", "A:true"]);
  });

  it.each([1, 2, 3])(
    "removing selected position %i chooses the right neighbor or last left survivor",
    async (position) => {
      const harness = await threeTabs();
      harness.tabs.handleCommand({ action: "select", position });
      harness.tabs.handleCommand({ action: "close" });
      const replacement = position === 3 ? 1 : position;
      expectRouting(harness, replacement);
      expect(harness.surfaces[position - 1]!.dispose).toHaveBeenCalledOnce();
      harness.tabs.handleCommand({ action: "close" });
      harness.tabs.handleCommand({ action: "close" });
      expect(harness.container.children).toHaveLength(0);
      expect(harness.strip.hidden).toBe(true);
      const calls = harness.surfaces.map(
        (surface) => surface.paste.mock.calls.length,
      );
      harness.tabs.clipboardAction("paste");
      expect(
        harness.surfaces.map((surface) => surface.paste.mock.calls.length),
      ).toEqual(calls);
    },
  );
});
