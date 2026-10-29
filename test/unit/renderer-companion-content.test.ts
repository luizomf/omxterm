// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type {
  HostedContentBridge,
  HostedContentDescriptor,
  HostedContentPresentation,
} from "../../src/shared/extension-view";
import {
  snippetsWindow,
  cleanupSnippetsWindows,
} from "../fixtures/snippets-window";

afterEach(cleanupSnippetsWindows);
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fixture() {
  const opens = new Set<(descriptor: HostedContentDescriptor) => void>();
  const retired = new Set<(id: string) => void>();
  const focuses = new Set<(id: string | null) => void>();
  const focus = (id: string | null) => {
    for (const listener of focuses) listener(id);
  };
  const bridge: HostedContentBridge = {
    onOpen(listener) {
      opens.add(listener);
      return () => {
        opens.delete(listener);
      };
    },
    onRetired(listener) {
      retired.add(listener);
      return () => {
        retired.delete(listener);
      };
    },
    onFailure: () => () => {},
    onFocus(listener) {
      focuses.add(listener);
      return () => {
        focuses.delete(listener);
      };
    },
    present: vi.fn(async (request: HostedContentPresentation) => {
      if (request.focus === true) focus(request.id);
      if (request.focus === "core" || request.id === null) focus(null);
      return true;
    }),
    close: vi.fn(async () => {}),
  };
  const sshPane = vi.fn();
  const f = await snippetsWindow({ hostedContent: bridge, sshPane });
  return {
    ...f,
    bridge,
    sshPane,
    focus,
    open(id = "files", panel = true) {
      for (const listener of opens)
        listener({
          id,
          title: id,
          ...(panel ? { presentation: "panel" as const } : {}),
        });
    },
    retire(id: string) {
      for (const listener of retired) listener(id);
    },
    tool(title: string) {
      return [
        ...f.root.querySelectorAll<HTMLButtonElement>(
          ".auxiliary-tools button",
        ),
      ].find((button) => button.textContent === title)!;
    },
  };
}

it("owns an empty Auxiliary Panel without enabling Snippets", async () => {
  const { root, host, load } = await snippetsWindow({}, false);
  expect(root.hidden).toBe(true);
  expect(root.classList.contains("auxiliary-panel")).toBe(true);
  expect(root.querySelector(".auxiliary-header button")).not.toBeNull();
  expect(document.querySelectorAll(".auxiliary-separator")).toHaveLength(1);
  expect(root.querySelector(".auxiliary-body")!.children).toHaveLength(0);
  expect(document.querySelector(".snippet-preview")).toBeNull();
  expect(load).not.toHaveBeenCalled();
  host.dispose();
  host.dispose();
  expect(root.children).toHaveLength(0);
  expect(document.querySelector(".auxiliary-separator")).toBeNull();
  expect(document.querySelector(".auxiliary-status")).toBeNull();
});

it("retains exclusive tools outside Application Tabs and repeat opens reuse the same slot", async () => {
  const f = await fixture();
  f.open();
  await settle();
  const files = f.root.querySelector(".companion-native-slot");
  expect(f.root.hidden).toBe(false);
  expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(0);
  expect(document.querySelectorAll(".terminal-tab")).toHaveLength(1);
  f.open();
  await settle();
  expect(f.root.querySelectorAll(".companion-native-slot")).toHaveLength(1);
  expect(f.root.querySelector(".companion-native-slot")).toBe(files);
  f.open("ssh");
  await settle();
  expect((files as HTMLElement).hidden).toBe(true);
  f.tool("files").click();
  await settle();
  expect((files as HTMLElement).hidden).toBe(false);
  f.tool("Snippets").click();
  await settle();
  await vi.waitFor(() => expect(f.root.querySelector("input")).not.toBeNull());
  const query = f.root.querySelector("input")!;
  query.value = "retained";
  query.dispatchEvent(new Event("input", { bubbles: true }));
  f.tool("files").click();
  await settle();
  f.tool("Snippets").click();
  await settle();
  expect(f.root.querySelector("input")).toBe(query);
  expect(query.value).toBe("retained");
  f.root.querySelector<HTMLButtonElement>(".auxiliary-header button")!.click();
  await settle();
  expect(f.root.hidden).toBe(true);
  expect(f.bridge.close).not.toHaveBeenCalled();
  f.open();
  await settle();
  expect(f.root.querySelector(".companion-native-slot")).toBe(files);
  expect(f.adapters).toHaveBeenCalledOnce();
});

it("keeps panel pixels across terminal changes and awaits core focus before activating the new terminal", async () => {
  const f = await fixture();
  f.open();
  await settle();
  const handoff = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => handoff.promise);
  vi.mocked(f.bridge.present).mockClear();
  f.tabCommand({ action: "new" });
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0]).toMatchObject({
    id: "files",
    focus: "core",
  });
  expect(f.surfaces[1]!.focus).not.toHaveBeenCalled();
  handoff.resolve(true);
  await settle();
  expect(f.surfaces[1]!.focus).toHaveBeenCalled();
  f.tabCommand({ action: "previous" });
  await settle();
  expect(
    vi
      .mocked(f.bridge.present)
      .mock.calls.every(([request]) => request.id === "files"),
  ).toBe(true);
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
});

it("suspends for Settings and ordinary hosted tabs and restores the retained tool on terminal return", async () => {
  const f = await fixture();
  f.open();
  await settle();
  const slot = f.root.querySelector(".companion-native-slot");
  f.settingsOpen();
  await settle();
  expect(f.root.hidden).toBe(true);
  f.tabCommand({ action: "select", position: 1 });
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(f.root.querySelector(".companion-native-slot")).toBe(slot);
  f.open("general", false);
  await settle();
  expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(1);
  expect(f.root.hidden).toBe(true);
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0].id).toBe("general");
  f.tabCommand({ action: "select", position: 1 });
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0].id).toBe("files");
});

it("waits for modal hide, ignores late tool opens, and retires hidden tools without touching the selected terminal", async () => {
  const f = await fixture();
  f.open();
  await settle();
  const hide = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => hide.promise);
  f.about();
  expect(document.querySelector(".about-dialog")).toBeNull();
  f.open("late");
  await settle();
  expect(
    vi
      .mocked(f.bridge.present)
      .mock.calls.some(([request]) => request.id === "late"),
  ).toBe(false);
  hide.resolve(true);
  await settle();
  expect(document.querySelector(".about-dialog")).not.toBeNull();
  f.open("ssh");
  await settle();
  expect(f.tool("ssh")).toBeDefined();
  expect(
    vi
      .mocked(f.bridge.present)
      .mock.calls.some(([request]) => request.id === "ssh"),
  ).toBe(false);
  f.retire("ssh");
  await settle();
  expect(f.tool("ssh")).toBeUndefined();
  document.querySelector<HTMLButtonElement>(".about-close")!.click();
  await settle();
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0].id).toBe("files");
  f.retire("files");
  await settle();
  expect(f.root.hidden).toBe(true);
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
});

it("drops a stale overlay continuation after terminal selection changes", async () => {
  const f = await fixture();
  f.open();
  await settle();
  const hide = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => hide.promise);
  f.about();
  f.tabCommand({ action: "new" });
  await settle();
  hide.resolve(true);
  await settle();
  expect(document.querySelector(".about-dialog")).toBeNull();
  expect(f.root.hidden).toBe(false);
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0].id).toBe("files");
});

it("keeps a late SSH transfer in the background when its panel no longer owns focus", async () => {
  const f = await fixture();
  f.open("ssh");
  await settle();
  f.focus(null);
  f.surfaces[0]!.focus.mockClear();
  f.tabCommand({
    action: "open-ssh",
    token: "background",
    sourceView: "ssh",
    title: "SSH",
  });
  await settle();
  expect(document.querySelectorAll(".terminal-tab")).toHaveLength(2);
  expect(document.querySelectorAll(".terminal-tab:not([hidden])")).toHaveLength(
    1,
  );
  expect(f.surfaces[1]!.focus).not.toHaveBeenCalled();
  expect(f.root.hidden).toBe(false);
  expect(f.sshPane).toHaveBeenCalledWith("background", true);
});

it("fails closed when a native panel refuses the overlay hide", async () => {
  const f = await fixture();
  f.open();
  await settle();
  vi.mocked(f.bridge.present).mockResolvedValueOnce(false);
  f.about();
  await settle();
  expect(document.querySelector(".about-dialog")).toBeNull();
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "could not",
  );
});

it("counts native focus for page activation and opens SSH in a new focused terminal without hiding the panel", async () => {
  const f = await fixture();
  f.open("ssh");
  await settle();
  f.surfaces[0]!.focus.mockClear();
  window.dispatchEvent(new Event("focus"));
  expect(f.surfaces[0]!.focus).not.toHaveBeenCalled();
  vi.mocked(f.bridge.present).mockClear();
  f.tabCommand({
    action: "open-ssh",
    token: "token-a",
    sourceView: "ssh",
    title: "SSH",
  });
  await settle();
  expect(document.querySelectorAll(".terminal-tab")).toHaveLength(2);
  expect(f.sshPane).toHaveBeenCalledWith("token-a", true);
  expect(f.surfaces[1]!.focus).toHaveBeenCalled();
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
  expect(f.root.hidden).toBe(false);
  expect(
    vi
      .mocked(f.bridge.present)
      .mock.calls.every(([request]) => request.id === "ssh"),
  ).toBe(true);
  expect(
    vi
      .mocked(f.bridge.present)
      .mock.calls.some(([request]) => request.focus === "core"),
  ).toBe(true);
  f.retire("ssh");
  await settle();
  expect(f.surfaces[1]!.dispose).not.toHaveBeenCalled();
});
