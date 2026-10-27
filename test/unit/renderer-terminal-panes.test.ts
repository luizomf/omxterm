// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";
import { createResttyContextMenu } from "../../src/terminal-surface/restty-host-services";

afterEach(() => vi.restoreAllMocks());

async function splitHarness(size = { cols: 120, rows: 40 }) {
  const harness = createTabsHarness({
    tabSize: { width: size.cols * 10, height: size.rows * 20 },
  });
  await harness.tabs.ready;
  harness.sessionAdapters[0]!.resize(size);
  return harness;
}

async function split(
  harness: Awaited<ReturnType<typeof splitHarness>>,
  direction: "right" | "down",
) {
  const count = harness.surfaces.length;
  harness.tabs.handleCommand({ action: "split", direction });
  await vi.waitFor(() => expect(harness.surfaces).toHaveLength(count + 1));
  // The new pane's Surface reports its grid like a real one would.
  harness.sessionAdapters.at(-1)!.resize({ cols: 120, rows: 40 });
}

const tab = (harness: ReturnType<typeof createTabsHarness>) =>
  harness.container.querySelector<HTMLElement>(".terminal-tab")!;

describe("Terminal Panes", () => {
  it("splits the focused pane into a sibling started from its session", async () => {
    const harness = await splitHarness();
    await split(harness, "right");

    expect(harness.createAdapter).toHaveBeenLastCalledWith("s1");
    expect(harness.container.children).toHaveLength(1);
    expect(tab(harness).hasAttribute("data-split")).toBe(true);
    const row = tab(harness).querySelector(".terminal-pane-split")!;
    expect(row.getAttribute("data-direction")).toBe("row");
    expect(row.querySelector('[role="separator"]')).not.toBeNull();
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s2", [
      "s1",
      "s2",
    ]);
    expect(tab(harness).querySelectorAll(".pane-focused")).toHaveLength(1);
    expect(harness.surfaces[1]!.focus).toHaveBeenCalled();
    expect(harness.adapters[0]!.close).not.toHaveBeenCalled();
  });

  it.each([
    ["right", "vertical", "ArrowRight", "ArrowLeft", "ArrowUp"],
    ["down", "horizontal", "ArrowDown", "ArrowUp", "ArrowLeft"],
  ] as const)(
    "retains %s separator keyboard focus and ARIA values",
    async (direction, orientation, increase, decrease, unrelated) => {
      const harness = await splitHarness();
      await split(harness, direction);
      const layout = tab(harness).querySelector<HTMLElement>(
        ".terminal-pane-split",
      )!;
      vi.spyOn(layout, "getBoundingClientRect").mockReturnValue({
        width: 1200,
        height: 800,
      } as DOMRect);
      const divider =
        tab(harness).querySelector<HTMLElement>('[role="separator"]')!;
      expect(divider.tabIndex).toBe(0);
      expect(divider.getAttribute("aria-orientation")).toBe(orientation);
      expect(divider.getAttribute("aria-label")).toBe("Resize panes");
      expect(divider.getAttribute("aria-valuemin")).toBe("0");
      expect(divider.getAttribute("aria-valuemax")).toBe("100");
      expect(divider.getAttribute("aria-valuenow")).toBe("50");
      divider.focus();
      const key = (value: string) => {
        const event = new KeyboardEvent("keydown", {
          key: value,
          bubbles: true,
          cancelable: true,
        });
        divider.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(key(increase)).toBe(true);
      expect(Number(divider.getAttribute("aria-valuenow"))).toBeGreaterThan(50);
      expect(document.activeElement).toBe(divider);
      expect(key(decrease)).toBe(true);
      expect(divider.getAttribute("aria-valuenow")).toBe("50");
      expect(key(unrelated)).toBe(false);
      expect(key("Enter")).toBe(false);
      expect(document.activeElement).toBe(divider);
      harness.tabs.dispose();
    },
  );

  it.each([
    [{ cols: 40, rows: 40 }, "right"],
    [{ cols: 120, rows: 10 }, "down"],
    [{ cols: 120, rows: 3 }, "right"],
    [{ cols: 19, rows: 40 }, "down"],
  ] as const)(
    "refuses a split below the 20 x 5 reference with no session (%o %s)",
    async (size, direction) => {
      const harness = await splitHarness(size);
      harness.tabs.handleCommand({ action: "split", direction });
      await Promise.resolve();
      expect(harness.createAdapter).toHaveBeenCalledOnce();
      expect(tab(harness).hasAttribute("data-split")).toBe(false);
    },
  );

  it("refuses a padded 41-column source whose prospective panes have only 19 usable columns", async () => {
    const harness = createTabsHarness({
      tabSize: { width: 426, height: 800 },
      surfaceGeometry: {
        cellWidth: 10,
        cellHeight: 20,
        insetWidth: 16,
        insetHeight: 8,
      },
    });
    await harness.tabs.ready;
    harness.sessionAdapters[0]!.resize({ cols: 41, rows: 39 });
    harness.tabs.handleCommand({ action: "split", direction: "right" });
    expect(harness.createAdapter).toHaveBeenCalledOnce();
    expect(tab(harness).hasAttribute("data-split")).toBe(false);
    harness.tabs.dispose();
  });

  it("refuses to split a pane whose grid is not known yet", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "split", direction: "right" });
    expect(harness.createAdapter).toHaveBeenCalledOnce();
  });

  it("routes every terminal-directed action to the focused pane only", async () => {
    const harness = await splitHarness();
    await split(harness, "down");
    harness.tabs.handleCommand({ action: "focus-pane", target: "previous" });
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s1", [
      "s1",
      "s2",
    ]);

    harness.tabs.clipboardAction("paste");
    harness.tabs.find();
    harness.tabs.injectText("'/tmp/a b'");
    harness.tabs.captureSnippetTarget()!.deliver("printf hi", true);
    const [first, second] = harness.surfaces;
    expect(first!.paste).toHaveBeenCalledOnce();
    expect(first!.find).toHaveBeenCalledOnce();
    expect(first!.inject).toHaveBeenCalledTimes(2);
    expect(second!.paste).not.toHaveBeenCalled();
    expect(second!.inject).not.toHaveBeenCalled();

    harness.tabs.zoom("in");
    for (const surface of harness.surfaces)
      expect(surface.zoom).toHaveBeenCalledWith("in");
  });

  it("follows the focused pane's title in the tab strip", async () => {
    const harness = await splitHarness();
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.tabs.handleCommand({ action: "previous" });
    await split(harness, "right");
    harness.tabs.setSessionTitle("s1", "editor");
    harness.tabs.setSessionTitle("s3", "build");
    expect(harness.strip.querySelector("button")!.textContent).toBe("build");
    harness.tabs.handleCommand({ action: "focus-pane", target: "next" });
    expect(harness.strip.querySelector("button")!.textContent).toBe("editor");
  });

  it("removes an exited pane, focuses its sibling and keeps the tab", async () => {
    const harness = await splitHarness();
    await split(harness, "right");
    harness.adapters[1]!.handlers!.onExit({ exitCode: 0, signal: 0 });

    expect(harness.container.children).toHaveLength(1);
    expect(tab(harness).hasAttribute("data-split")).toBe(false);
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s1", ["s1"]);
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
  });

  it.each(["input", "textarea"] as const)(
    "preserves the surviving focused %s when a background pane exits",
    async (tag) => {
      const harness = await splitHarness();
      await split(harness, "right");
      const first = tab(harness).querySelector("main")!;
      const field = document.createElement(tag);
      field.value = "find this";
      first.append(field);
      field.focus();
      field.setSelectionRange(2, 6);
      expect(document.activeElement).toBe(field);
      harness.adapters[1]!.handlers!.onExit({ exitCode: 0, signal: 0 });
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([2, 6]);
      harness.tabs.dispose();
    },
  );

  it.each([0, 1])(
    "preserves an outside panel field when pane %i exits",
    async (index) => {
      let field: HTMLInputElement | undefined;
      const harness = createTabsHarness({
        tabsOptions: { canAutoFocus: () => document.activeElement !== field },
      });
      await harness.tabs.ready;
      harness.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
      await split(harness, "right");
      field = document.createElement("input");
      document.body.append(field);
      field.focus();
      for (const surface of harness.surfaces) surface.focus.mockClear();
      harness.adapters[index]!.handlers!.onExit({ exitCode: 0, signal: 0 });
      expect(document.activeElement).toBe(field);
      for (const surface of harness.surfaces)
        expect(surface.focus).not.toHaveBeenCalled();
      harness.tabs.dispose();
    },
  );

  it("never takes focus from panel controls when a focused pane exits", async () => {
    let allowPassive = true;
    const harness = createTabsHarness({
      tabsOptions: { canAutoFocus: () => allowPassive },
    });
    await harness.tabs.ready;
    harness.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
    harness.tabs.handleCommand({ action: "split", direction: "right" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.surfaces[0]!.focus.mockClear();
    allowPassive = false;
    harness.adapters[1]!.handlers!.onExit({ exitCode: 0, signal: 0 });
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s1", ["s1"]);
    expect(harness.surfaces[0]!.focus).not.toHaveBeenCalled();
  });

  it.each([
    [0, "s2"],
    [1, "s1"],
    [2, "s2"],
  ] as const)(
    "closing pane %i selects its non-wrapping nearest sibling %s",
    async (position, expected) => {
      const harness = await splitHarness();
      await split(harness, "right");
      await split(harness, "right");
      const panes = tab(harness).querySelectorAll("main");
      const field = document.createElement("input");
      panes[position]!.append(field);
      field.focus();
      harness.tabs.handleCommand({ action: "close-pane" });
      expect(harness.notifySelection.mock.calls.at(-1)?.[0]).toBe(expected);
      harness.tabs.dispose();
    },
  );

  it("keeps an unexpectedly signalled pane until main orders its removal", async () => {
    const harness = await splitHarness();
    await split(harness, "right");
    harness.adapters[1]!.handlers!.onExit({ exitCode: 0, signal: 9 });
    expect(tab(harness).hasAttribute("data-split")).toBe(true);

    harness.tabs.handleCommand({ action: "close-session", sessionId: "s2" });
    expect(tab(harness).hasAttribute("data-split")).toBe(false);
    expect(harness.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
  });

  it("closes the pane captured before confirmation, not a later focus", async () => {
    const harness = await splitHarness();
    await split(harness, "right");
    harness.tabs.handleCommand({ action: "prepare-close-pane" });
    harness.tabs.handleCommand({ action: "focus-pane", target: "previous" });
    harness.tabs.handleCommand({
      action: "resolve-close-pane",
      confirmed: true,
    });
    expect(harness.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();

    harness.tabs.handleCommand({ action: "prepare-close-pane" });
    harness.tabs.handleCommand({
      action: "resolve-close-pane",
      confirmed: false,
    });
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
  });

  it("closes the last pane through the last-tab path", async () => {
    const notifyEmpty = vi.fn();
    const harness = createTabsHarness({ tabsOptions: { notifyEmpty } });
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "close-pane" });
    expect(harness.surfaces[0]!.dispose).toHaveBeenCalledOnce();
    expect(harness.container.children).toHaveLength(0);
    expect(notifyEmpty).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("closes every pane of a closed tab", async () => {
    const harness = await splitHarness();
    await split(harness, "right");
    await split(harness, "down");
    harness.tabs.handleCommand({ action: "close" });
    for (const surface of harness.surfaces)
      expect(surface.dispose).toHaveBeenCalledOnce();
    expect(harness.container.children).toHaveLength(0);
  });

  it("hides a background tab's pane containers with the tab", async () => {
    const harness = await splitHarness();
    await split(harness, "right");
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
    const [first] = [...harness.container.children] as HTMLElement[];
    expect(first!.hidden).toBe(true);
    for (const pane of first!.querySelectorAll<HTMLElement>("main"))
      expect(pane.hidden).toBe(true);
    harness.tabs.handleCommand({ action: "previous" });
    for (const pane of first!.querySelectorAll<HTMLElement>("main"))
      expect(pane.hidden).toBe(false);
  });

  it("equalizes the focused pane's split", async () => {
    const harness = await splitHarness();
    await split(harness, "right");
    await split(harness, "right");
    const shares = () =>
      [
        ...tab(harness).querySelectorAll<HTMLElement>(
          ".terminal-pane-split > main",
        ),
      ].map((element) => Number(element.style.flexGrow));
    expect(shares()).toEqual([0.5, 0.25, 0.25]);
    harness.tabs.handleCommand({ action: "equalize-panes" });
    for (const share of shares()) expect(share).toBeCloseTo(1 / 3);
  });
});

describe("Terminal Pane context menu", () => {
  it("does not borrow a sibling's target while the clicked pane is pending or dead", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const clipboard = {
      writeText: vi.fn(async () => {}),
      readText: vi.fn(async () => ""),
      confirmPaste: vi.fn(async () => false),
      requestContextMenu: vi.fn(),
    };
    const harness = createTabsHarness({
      surfaceOptions: { clipboard },
      beforeStart: async (index) => {
        if (index === 2) await gate;
      },
    });
    await harness.tabs.ready;
    harness.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
    harness.tabs.handleCommand({ action: "split", direction: "right" });
    harness.mountedSurfaceOptions[1]!.clipboard!.requestContextMenu();
    expect(clipboard.requestContextMenu).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.adapters[1]!.handlers!.onExit({ exitCode: 0, signal: 9 });
    harness.mountedSurfaceOptions[1]!.clipboard!.requestContextMenu();
    expect(clipboard.requestContextMenu).not.toHaveBeenCalled();
    harness.tabs.dispose();
  });

  it("focuses a right-clicked pane and offers Close Pane only while split", async () => {
    const clipboard = {
      writeText: vi.fn(async () => {}),
      readText: vi.fn(async () => ""),
      confirmPaste: vi.fn(async () => false),
      requestContextMenu: vi.fn(),
    };
    const harness = createTabsHarness({
      tabSize: { width: 1200, height: 800 },
      surfaceOptions: { clipboard },
    });
    await harness.tabs.ready;
    harness.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
    const menu = (index: number) => {
      const options = harness.mountedSurfaceOptions[index]!;
      options.onContextMenu?.();
      options.clipboard!.requestContextMenu();
    };

    menu(0);
    expect(clipboard.requestContextMenu).toHaveBeenLastCalledWith({
      sessionId: "s1",
      menuId: 1,
    });

    await split(harness, "right");
    expect(harness.notifySelection.mock.calls.at(-1)?.[0]).toBe("s2");
    harness.surfaces[0]!.focus.mockClear();
    // Compose the Surface's production listener with the pane host. A padding
    // context event still selects/focuses the clicked pane without a popup.
    const firstOptions = harness.mountedSurfaceOptions[0]!;
    const padding = tab(harness).querySelector<HTMLElement>("main")!;
    const suppressed = createResttyContextMenu(padding, {
      ...firstOptions,
      contextMenuEnabled: false,
    });
    padding.addEventListener("contextmenu", suppressed.handle);
    clipboard.requestContextMenu.mockClear();
    const event = new Event("contextmenu", { bubbles: true, cancelable: true });
    padding.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(clipboard.requestContextMenu).not.toHaveBeenCalled();
    expect(harness.notifySelection.mock.calls.at(-1)?.[0]).toBe("s1");
    expect(harness.surfaces[0]!.focus).toHaveBeenCalled();
    padding.removeEventListener("contextmenu", suppressed.handle);
    menu(0);
    expect(clipboard.requestContextMenu).toHaveBeenLastCalledWith({
      sessionId: "s1",
      menuId: 2,
      closePane: true,
    });
    expect(harness.notifySelection.mock.calls.at(-1)?.[0]).toBe("s1");
    expect(harness.surfaces[0]!.focus).toHaveBeenCalled();

    // Main echoes the popup's target, not a later focused pane.
    harness.tabs.handleCommand({
      action: "close-pane",
      target: { sessionId: "s1", menuId: 2 },
    });
    expect(harness.surfaces[0]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[1]!.dispose).not.toHaveBeenCalled();
    clipboard.requestContextMenu.mockClear();
    menu(0);
    expect(clipboard.requestContextMenu).not.toHaveBeenCalled();
    menu(1);
    expect(clipboard.requestContextMenu).toHaveBeenLastCalledWith({
      sessionId: "s2",
      menuId: 3,
    });
    harness.tabs.dispose();
  });
});
