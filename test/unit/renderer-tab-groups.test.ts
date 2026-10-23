// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  addToGroup,
  nextGroupColor,
  normalizeGroups,
  TAB_COLORS,
  type TabGroup,
} from "../../src/renderer/tab-groups";
import type { WorkspaceSnapshot } from "../../src/shared/workspace";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

describe("tab group model", () => {
  const tab = (name: string, group?: TabGroup) => ({ name, group });

  it("keeps a group's tabs adjacent and picks unused colors", () => {
    const work: TabGroup = { name: "Work", color: "#f66151", collapsed: false };
    const tabs = [tab("a", work), tab("b"), tab("c"), tab("d", work)];
    normalizeGroups(tabs);
    expect(tabs.map((item) => item.group?.name)).toEqual([
      "Work",
      undefined,
      undefined,
      undefined,
    ]);
    addToGroup(tabs, tabs[2]!, work);
    expect(tabs.map((item) => item.name)).toEqual(["a", "c", "b", "d"]);
    expect(nextGroupColor(tabs)).toBe(TAB_COLORS[1]![1]);
  });
});

async function threeTabs() {
  const harness = createTabsHarness();
  await harness.tabs.ready;
  harness.tabs.handleCommand({ action: "new" });
  harness.tabs.handleCommand({ action: "new" });
  await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
  return harness;
}

const tabButtons = (strip: HTMLElement) => [
  ...strip.querySelectorAll<HTMLButtonElement>("button[role=tab]"),
];
const openMenu = (button: HTMLElement) =>
  button.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
  );
const menuItem = (label: string) =>
  [
    ...document.querySelectorAll<HTMLButtonElement>(".omx-context-menu button"),
  ].find((button) => button.textContent === label)!;
const dialog = () =>
  vi.waitFor(() => {
    const element = document.querySelector<HTMLDialogElement>("dialog[open]");
    if (!element) throw new Error("no dialog");
    return element;
  });
const confirm = (element: HTMLElement) =>
  element
    .querySelector<HTMLButtonElement>(".omx-modal-actions button:last-child")!
    .click();

describe("tab menu", () => {
  it("renames, colors and groups tabs from the strip", async () => {
    const harness = await threeTabs();
    openMenu(tabButtons(harness.strip)[0]!);
    menuItem("Rename Tab…").click();
    let element = await dialog();
    const input = element.querySelector<HTMLInputElement>("input")!;
    input.value = "build";
    confirm(element);
    await vi.waitFor(() =>
      expect(tabButtons(harness.strip)[0]!.textContent).toBe("build"),
    );

    openMenu(tabButtons(harness.strip)[0]!);
    menuItem("Tab Color…").click();
    element = await dialog();
    element.querySelector<HTMLButtonElement>("[aria-label=Blue]")!.click();
    confirm(element);
    await vi.waitFor(() =>
      expect(
        tabButtons(harness.strip)[0]!.style.getPropertyValue("--tab-color"),
      ).toBe("#62a0ea"),
    );

    openMenu(tabButtons(harness.strip)[0]!);
    menuItem("New Group from Tab…").click();
    element = await dialog();
    element.querySelector<HTMLInputElement>("input")!.value = "Servers";
    confirm(element);
    const chip = await vi.waitFor(() => {
      const found =
        harness.strip.querySelector<HTMLButtonElement>(".tab-group-chip");
      if (!found) throw new Error("no chip");
      return found;
    });
    expect(chip.textContent).toBe("Servers");

    openMenu(tabButtons(harness.strip)[2]!);
    menuItem("Add to “Servers”").click();
    expect(
      tabButtons(harness.strip).map((button) =>
        button.classList.contains("tab-grouped"),
      ),
    ).toEqual([true, true, false]);

    // Collapsing hides the group's tabs except the selected one.
    harness.strip.querySelector<HTMLButtonElement>(".tab-group-chip")!.click();
    expect(tabButtons(harness.strip).map((button) => button.hidden)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("duplicates a tab next to it as a shell in the same directory", async () => {
    const harness = await threeTabs();
    openMenu(tabButtons(harness.strip)[0]!);
    menuItem("Duplicate Tab").click();
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(4));
    expect(
      (harness.createAdapter.mock.lastCall as unknown[] | undefined)?.[0],
    ).toEqual({ kind: "inherit", sessionId: "s1" });
    expect(
      tabButtons(harness.strip).map(
        (button) => button.getAttribute("aria-selected") === "true",
      ),
    ).toEqual([false, true, false, false]);
  });

  it("opens the menu from the keyboard", async () => {
    const harness = await threeTabs();
    tabButtons(harness.strip)[1]!.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "F10",
        shiftKey: true,
      }),
    );
    expect(document.querySelector(".omx-context-menu")).not.toBeNull();
  });
});

describe("restoring tab looks", () => {
  it("reapplies names, colors and shared groups, and reports them", async () => {
    const onWorkspaceChange = vi.fn();
    const group = { name: "Servers", color: "#57e389", collapsed: false };
    const shell = { layout: { pane: 0 }, focused: 0 } as const;
    const harness = createTabsHarness({
      onWorkspaceChange,
      initialWorkspace: {
        selected: 0,
        tabs: [
          { ...shell, panes: [{ kind: "shell" }], title: "db", group },
          { ...shell, panes: [{ kind: "shell" }], color: "#62a0ea", group },
          { ...shell, panes: [{ kind: "shell" }] },
        ],
      },
    });
    await harness.tabs.ready;
    expect(harness.strip.querySelectorAll(".tab-group-chip")).toHaveLength(1);
    expect(tabButtons(harness.strip)[0]!.textContent).toBe("db");
    await vi.waitFor(() => expect(onWorkspaceChange).toHaveBeenCalled());
    const [snapshot] = onWorkspaceChange.mock.lastCall as [WorkspaceSnapshot];
    const tabs = snapshot.tabs;
    expect(tabs[0]).toMatchObject({ title: "db", group });
    expect(tabs[1]).toMatchObject({ color: "#62a0ea", group });
    expect(tabs[2]).not.toHaveProperty("group");
  });
});

describe("arranging and closing tabs", () => {
  async function fourTabs(options: Parameters<typeof createTabsHarness>[0]) {
    const harness = createTabsHarness(options);
    await harness.tabs.ready;
    for (let count = 0; count < 3; count += 1)
      harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(4));
    return harness;
  }
  const labels = (strip: HTMLElement) =>
    tabButtons(strip).map((button) => button.textContent);

  it("moves a tab left and right", async () => {
    const harness = await fourTabs({});
    harness.tabs.setSessionTitle("s1", "one");
    openMenu(tabButtons(harness.strip)[0]!);
    expect(menuItem("Move Tab Left").disabled).toBe(true);
    menuItem("Move Tab Right").click();
    expect(labels(harness.strip)[1]).toBe("one");
  });

  it("closes tabs to the right and others, asking when a program runs", async () => {
    const paneBusy = vi.fn(async (ids: readonly string[]) =>
      ids.includes("s4"),
    );
    const harness = await fourTabs({ paneBusy });
    openMenu(tabButtons(harness.strip)[1]!);
    menuItem("Close Tabs to the Right").click();
    const element = await dialog();
    expect(element.textContent).toContain("Close them anyway?");
    expect(paneBusy).toHaveBeenCalledWith(["s3", "s4"]);
    confirm(element);
    await vi.waitFor(() => expect(tabButtons(harness.strip)).toHaveLength(2));

    openMenu(tabButtons(harness.strip)[0]!);
    menuItem("Close Other Tabs").click();
    // One tab left: the strip hides (it shows only with two or more).
    await vi.waitFor(() => expect(harness.strip.hidden).toBe(true));
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("detaches a tab into a new window and closes it here", async () => {
    const detachTab = vi.fn(async () => true);
    const harness = await fourTabs({ detachTab });
    openMenu(tabButtons(harness.strip)[2]!);
    menuItem("Detach Tab to New Window").click();
    await vi.waitFor(() => expect(tabButtons(harness.strip)).toHaveLength(3));
    expect(detachTab).toHaveBeenCalledWith({
      selected: 0,
      tabs: [
        expect.objectContaining({
          panes: [{ sessionId: "s3" }],
        }) as unknown,
      ],
    });
  });
});
