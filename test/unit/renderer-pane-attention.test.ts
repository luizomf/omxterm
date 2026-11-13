// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  createTabsHarness,
  selectedStates,
} from "../fixtures/terminal-tabs-harness";

const marks = (root: Element) =>
  [...root.querySelectorAll<HTMLElement>(".ui-mark")].map(
    (mark) => `${mark.dataset.glyph}:${mark.getAttribute("aria-label")}`,
  );
const pane = (container: HTMLElement, index: number) =>
  container.querySelectorAll(".terminal-tab")[index]!;
const tabButton = (strip: HTMLElement, index: number) =>
  strip.querySelectorAll("button")[index]!;

async function twoTabs() {
  const notifyDesktop = vi.fn();
  const harness = createTabsHarness({ tabsOptions: { notifyDesktop } });
  await harness.tabs.ready;
  harness.tabs.handleCommand({ action: "new" });
  await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
  harness.tabs.setSessionTitle("s1", "agent");
  harness.tabs.setSessionTitle("s2", "shell");
  return { ...harness, notifyDesktop };
}

describe("pane attention State Marks", () => {
  it("shows working while a program reports progress, on its pane and tab", async () => {
    const h = await twoTabs();
    const first = h.mountedSurfaceOptions[0]!;

    first.onProgress?.(true);
    first.onProgress?.(true);
    expect(marks(pane(h.container, 0))).toEqual(["working:Working."]);
    expect(marks(tabButton(h.strip, 0))).toEqual(["working:Working."]);
    expect(marks(pane(h.container, 1))).toEqual([]);

    first.onProgress?.(false);
    expect(marks(pane(h.container, 0))).toEqual([]);
    expect(marks(h.strip)).toEqual([]);
  });

  it("clears working when the same pane asks for attention, and forwards it", async () => {
    const h = await twoTabs();
    const [first, second] = h.mountedSurfaceOptions;
    first!.onProgress?.(true);
    second!.onProgress?.(true);

    first!.onBell?.();
    second!.onDesktopNotification?.({ title: "", body: "Done" });

    expect(marks(h.container)).toEqual([]);
    expect(h.notifyBell).toHaveBeenCalledExactlyOnceWith("s1");
    expect(h.notifyDesktop).toHaveBeenCalledExactlyOnceWith("s2", {
      title: "",
      body: "Done",
    });
  });

  it("follows main's attention verdict and drops marks when the session ends", async () => {
    const h = await twoTabs();
    h.tabs.setSessionAttention("s1", true);
    h.tabs.setSessionAttention("s9", true);
    expect(marks(pane(h.container, 0))).toEqual([
      "attention:Asked for your attention.",
    ]);
    expect(marks(tabButton(h.strip, 0))).toEqual([
      "attention:Asked for your attention.",
    ]);
    h.tabs.setSessionAttention("s1", false);
    expect(marks(h.container)).toEqual([]);

    h.mountedSurfaceOptions[1]!.onProgress?.(true);
    h.tabs.setSessionAttention("s2", true);
    expect(marks(pane(h.container, 1))).toHaveLength(2);
    h.adapters[1]!.handlers!.onExit({ exitCode: 0, signal: 9 });
    expect(marks(h.container)).toEqual([]);
  });

  it("reveals a notified session by selecting its tab", async () => {
    const h = await twoTabs();
    expect(selectedStates(h.strip)).toEqual(["agent:false", "shell:true"]);

    h.tabs.handleCommand({ action: "reveal-session", sessionId: "s1" });
    expect(selectedStates(h.strip)).toEqual(["agent:true", "shell:false"]);
    await vi.waitFor(() => expect(h.surfaces[0]!.focus).toHaveBeenCalled());

    h.tabs.handleCommand({ action: "reveal-session", sessionId: "s9" });
    expect(selectedStates(h.strip)).toEqual(["agent:true", "shell:false"]);
  });
});
