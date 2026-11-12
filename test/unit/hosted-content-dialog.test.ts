// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type {
  HostedContentBridge,
  HostedContentDescriptor,
} from "../../src/shared/extension-view";
import { isHostedContentDescriptor } from "../../src/shared/extension-view";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import { createCompanionContent } from "../../src/renderer/companion-content";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

const owners: { dispose(): void }[] = [];
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const frame = () =>
  document.querySelector<HTMLDialogElement>(".hosted-content-dialog");

async function harness(options: { blocked?: () => boolean } = {}) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const opens = new Set<(value: HostedContentDescriptor) => void>();
  let retired!: (id: string) => void;
  let dismiss!: (id: string) => void;
  let contentHeight!: (id: string, height: number) => void;
  const hosted: HostedContentBridge = {
    onOpen: (listener) => {
      opens.add(listener);
      return () => opens.delete(listener);
    },
    onRetired: (listener) => {
      retired = listener;
      return vi.fn();
    },
    onFailure: () => vi.fn(),
    onDismissPanel: (listener) => {
      dismiss = listener;
      return vi.fn();
    },
    onContentHeight: (listener) => {
      contentHeight = listener;
      return vi.fn();
    },
    present: vi.fn(async () => true),
    close: vi.fn(async (id: string) => retired(id)),
  };
  const language = createRendererLanguage();
  const companion = createCompanionContent(
    document.createElement("div"),
    undefined,
    hosted,
    {
      language,
      focusTerminal: () => h.tabs.focusSelected(),
      blocked: options.blocked ?? (() => false),
    },
  );
  const h = createTabsHarness({
    tabsOptions: {
      hostedContent: hosted,
      hostedPresentation: companion.presentation,
      selectContent: companion.select,
      isDialogShown: companion.dialogShown,
      language,
      showTabBar: true,
    },
  });
  owners.push(h.tabs, companion);
  await h.tabs.ready;
  await settle();
  const open = async (id = "setup") => {
    opens.forEach((listener) =>
      listener({ id, title: "Mirror Typing", presentation: "dialog" }),
    );
    await settle();
  };
  const presented = () =>
    vi.mocked(hosted.present).mock.calls.map(([value]) => value.id);
  return {
    ...h,
    hosted,
    companion,
    open,
    dismiss: (id: string) => dismiss(id),
    contentHeight: (id: string, height: number) => contentHeight(id, height),
    presented,
  };
}

it("accepts dialog descriptors from main", () => {
  expect(
    isHostedContentDescriptor({ id: "a", title: "A", presentation: "dialog" }),
  ).toBe(true);
  expect(
    isHostedContentDescriptor({ id: "a", title: "A", presentation: "sheet" }),
  ).toBe(false);
});

it("floats a dialog over the tab without adding a tab or showing the strip", async () => {
  const h = await harness();
  const children = h.container.children.length;
  await h.open();
  expect(h.container.children).toHaveLength(children);
  expect(h.strip.hidden).toBe(true);
  expect(frame()?.open).toBe(true);
  expect(frame()?.querySelector("h2")?.textContent).toBe("Mirror Typing");
  expect(frame()?.querySelector("button")?.getAttribute("aria-label")).toBe(
    "Close",
  );
  expect(h.companion.dialogShown("setup")).toBe(true);
  expect(vi.mocked(h.hosted.present).mock.calls.at(-1)![0]).toMatchObject({
    id: "setup",
    focus: true,
  });
});

it("closes on Close, returns the presenter and focuses the terminal", async () => {
  const h = await harness();
  await h.open();
  const focusCount = h.surfaces[0]!.focus.mock.calls.length;
  frame()!.querySelector("button")!.click();
  await settle();
  expect(h.hosted.close).toHaveBeenCalledExactlyOnceWith("setup");
  expect(frame()).toBeNull();
  expect(h.presented().at(-1)).toBeNull();
  expect(h.companion.dialogShown()).toBe(false);
  expect(h.surfaces[0]!.focus.mock.calls.length).toBeGreaterThan(focusCount);
});

it("closes when Escape in the view is dismissed through main", async () => {
  const h = await harness();
  await h.open();
  h.dismiss("setup");
  await settle();
  expect(h.hosted.close).toHaveBeenCalledExactlyOnceWith("setup");
  expect(frame()).toBeNull();
});

it("hides, but keeps, the view when another tab takes the window", async () => {
  const h = await harness();
  await h.open();
  h.tabs.handleCommand({ action: "new" });
  await settle();
  expect(frame()?.open).toBe(false);
  expect(h.companion.dialogShown()).toBe(false);
  expect(h.hosted.close).not.toHaveBeenCalled();
  expect(h.presented().at(-1)).toBeNull();
});

it("replaces an older dialog and refuses one that arrives over a modal", async () => {
  let blocked = false;
  const h = await harness({ blocked: () => blocked });
  await h.open("first");
  await h.open("second");
  expect(h.hosted.close).toHaveBeenCalledExactlyOnceWith("first");
  expect(document.querySelectorAll(".hosted-content-dialog")).toHaveLength(1);
  expect(h.companion.dialogShown("second")).toBe(true);
  expect(h.presented().at(-1)).toBe("second");
  frame()!.querySelector("button")!.click();
  await settle();
  blocked = true;
  await h.open("third");
  expect(h.hosted.close).toHaveBeenLastCalledWith("third");
  expect(frame()).toBeNull();
});

it("fits the dialog to the height its view reports", async () => {
  const h = await harness();
  await h.open();
  const slot = frame()!.querySelector<HTMLElement>(
    ".hosted-content-dialog-slot",
  )!;
  h.contentHeight("setup", 212);
  expect(slot.style.getPropertyValue("--hosted-dialog-fit")).toBe("212px");
  h.contentHeight("other", 400);
  expect(slot.style.getPropertyValue("--hosted-dialog-fit")).toBe("212px");
});
