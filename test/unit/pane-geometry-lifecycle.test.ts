// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

afterEach(() => vi.restoreAllMocks());

it.each([
  [871, 2],
  [872, 3],
] as const)(
  "accounts for the extra same-direction divider at %i CSS px",
  async (width, expectedPanes) => {
    const harness = createTabsHarness({
      tabSize: { width, height: 800 },
      surfaceGeometry: {
        cellWidth: 10,
        cellHeight: 20,
        insetWidth: 16,
        insetHeight: 8,
      },
    });
    await harness.tabs.ready;
    harness.sessionAdapters[0]!.resize({ cols: 85, rows: 39 });
    harness.tabs.handleCommand({ action: "split", direction: "right" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.sessionAdapters[1]!.resize({ cols: 41, rows: 39 });
    harness.tabs.handleCommand({ action: "split", direction: "right" });
    expect(harness.createAdapter).toHaveBeenCalledTimes(expectedPanes);
    await vi.waitFor(() =>
      expect(harness.surfaces).toHaveLength(expectedPanes),
    );
    harness.tabs.dispose();
  },
);

it.each([
  ["right", 453, 108],
  ["down", 226, 223],
] as const)(
  "includes non-grid padding/scrollbar overhead in both axes for %s",
  async (direction, width, height) => {
    const harness = createTabsHarness({
      tabSize: { width, height },
      surfaceGeometry: {
        cellWidth: 10,
        cellHeight: 20,
        insetWidth: 26,
        insetHeight: 10,
      },
    });
    await harness.tabs.ready;
    harness.sessionAdapters[0]!.resize({
      cols: direction === "right" ? 42 : 20,
      rows: direction === "right" ? 5 : 10,
    });
    harness.tabs.handleCommand({ action: "split", direction });
    // Right: (453-4)/2 < 226 required; Down: (223-4)/2 < 110.
    expect(harness.createAdapter).toHaveBeenCalledOnce();
    harness.tabs.dispose();
  },
);

it("subtracts the window title inset once, outside the prospective pane grids", async () => {
  const harness = createTabsHarness({ tabSize: { width: 404, height: 229 } });
  await harness.tabs.ready;
  const tab = harness.container.querySelector<HTMLElement>(".terminal-tab")!;
  tab.style.paddingTop = "30px";
  harness.sessionAdapters[0]!.resize({ cols: 40, rows: 9 });
  harness.tabs.handleCommand({ action: "split", direction: "down" });
  expect(harness.createAdapter).toHaveBeenCalledOnce();
  // With 234px, 30px of chrome plus two exact 5-row grids and a divider fit.
  vi.spyOn(tab, "getBoundingClientRect").mockReturnValue({
    width: 404,
    height: 234,
  } as DOMRect);
  harness.sessionAdapters[0]!.resize({ cols: 40, rows: 10 });
  harness.tabs.handleCommand({ action: "split", direction: "down" });
  expect(harness.createAdapter).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
  harness.tabs.dispose();
});

it("retires captured divider input when modal ownership changes or its layout is replaced", async () => {
  let interactive = true;
  const harness = createTabsHarness({
    tabsOptions: { canFocus: () => interactive },
  });
  await harness.tabs.ready;
  for (let count = 2; count <= 3; count += 1) {
    harness.sessionAdapters.at(-1)!.resize({ cols: 120, rows: 40 });
    harness.tabs.handleCommand({ action: "split", direction: "right" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(count));
  }
  const tab = harness.container.querySelector<HTMLElement>(".terminal-tab")!;
  const root = tab.firstElementChild as HTMLElement;
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
    width: 1200,
    height: 800,
  } as DOMRect);
  const divider = root.querySelector<HTMLElement>(".terminal-pane-divider")!;
  const pointer = (type: string, clientX: number) => {
    const event = new MouseEvent(type, { clientX, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 7 });
    divider.dispatchEvent(event);
  };
  pointer("pointerdown", 600);
  const shares = () =>
    [...root.querySelectorAll<HTMLElement>("main")].map(
      (pane) => pane.style.flexGrow,
    );
  const before = shares();
  interactive = false;
  pointer("pointermove", 700);
  interactive = true;
  pointer("pointermove", 800);
  expect(shares()).toEqual(before);
  pointer("pointerdown", 600);
  harness.tabs.handleCommand({ action: "close-pane" });
  const replacement = tab.innerHTML;
  pointer("pointermove", 700);
  expect(tab.innerHTML).toBe(replacement);
  harness.tabs.dispose();
});

it("clamps pointer and keyboard dividers to asymmetric mixed-metric subtree minima, preserving owners after shrink", async () => {
  const viewport = { width: 1600, height: 800 };
  const harness = createTabsHarness({ tabSize: viewport });
  await harness.tabs.ready;
  const split = async (direction: "right" | "down") => {
    const count = harness.surfaces.length;
    harness.sessionAdapters.at(-1)!.resize({ cols: 120, rows: 40 });
    harness.tabs.handleCommand({ action: "split", direction });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(count + 1));
  };
  await split("right"); // A | B
  harness.tabs.handleCommand({ action: "focus-pane", target: "previous" });
  await split("down"); // (A / C) | B
  await split("right"); // (A / (C | D)) | B
  const [a, b, c, d] = harness.surfaces;
  c!.geometry.mockReturnValue({
    cellWidth: 15,
    cellHeight: 20,
    insetWidth: 0,
    insetHeight: 0,
  });
  d!.geometry.mockReturnValue({
    cellWidth: 20,
    cellHeight: 30,
    insetWidth: 0,
    insetHeight: 0,
  });
  const tab = harness.container.querySelector<HTMLElement>(".terminal-tab")!;
  const root = tab.firstElementChild as HTMLElement;
  vi.spyOn(root, "getBoundingClientRect").mockImplementation(
    () => ({ ...viewport }) as DOMRect,
  );
  const divider = root.querySelector<HTMLElement>(
    ":scope > .terminal-pane-divider",
  )!;
  const weights = () =>
    [...root.children]
      .filter((element) => !element.classList.contains("terminal-pane-divider"))
      .map((element) => Number((element as HTMLElement).style.flexGrow));
  const keyboard = (key: string) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    divider.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  };
  const pointer = (type: string, clientX: number, pointerId = 7) => {
    const event = new MouseEvent(type, {
      clientX,
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      isPrimary: { value: true },
    });
    divider.dispatchEvent(event);
  };
  viewport.width = 1200;
  divider.focus();
  keyboard("ArrowLeft");
  // C needs 300px and D 400px, but their retained halves each need 400px.
  // With the internal divider, the subtree needs 804px, not the 704px sum.
  // Root distributable space is 1196px; B independently needs 200px.
  expect(weights()[0]).toBeCloseTo(804 / 1196);
  expect(weights()[1]).toBeCloseTo(392 / 1196);
  const innerShares = () =>
    [
      ...root.querySelectorAll<HTMLElement>(
        '[data-direction="column"] [data-direction="row"] > main',
      ),
    ].map((pane) => Number(pane.style.flexGrow));
  expect(innerShares()).toEqual([0.5, 0.5]);
  const leftWidth = weights()[0]! * 1196;
  expect(
    Math.floor(((leftWidth - 4) * innerShares()[0]!) / 15),
  ).toBeGreaterThanOrEqual(20);
  expect(
    Math.floor(((leftWidth - 4) * innerShares()[1]!) / 20),
  ).toBeGreaterThanOrEqual(20);
  expect(divider.getAttribute("aria-valuenow")).toBe("67");
  expect(document.activeElement).toBe(divider);
  pointer("pointerdown", 804);
  pointer("pointermove", 1000, 8); // A second pointer cannot resize this drag.
  expect(weights()[0]).toBeCloseTo(804 / 1196);
  pointer("pointermove", -1000);
  pointer("pointerup", -1000);
  expect(weights()[0]).toBeCloseTo(804 / 1196);
  pointer("pointermove", 1100); // Ended drag is inert.
  expect(weights()[0]).toBeCloseTo(804 / 1196);
  keyboard("ArrowRight");
  const retained = weights();
  expect(innerShares()).toEqual([0.5, 0.5]);
  viewport.width = 800; // 804+200 no longer fits in 796px.
  keyboard("ArrowLeft");
  pointer("pointerdown", 600);
  pointer("pointermove", 100);
  pointer("pointercancel", 100);
  expect(weights()).toEqual(retained);
  expect(harness.surfaces).toEqual([a, b, c, d]);
  expect(harness.createAdapter).toHaveBeenCalledTimes(4);
  for (const surface of harness.surfaces)
    expect(surface.dispose).not.toHaveBeenCalled();
  harness.tabs.dispose();
});
