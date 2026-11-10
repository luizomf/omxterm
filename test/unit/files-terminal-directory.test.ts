import { expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { translatorFor } from "../../src/shared/i18n";
import { createFilesTerminalDirectory } from "../../src/main/files-terminal-directory";
import type { ExtensionTarget } from "../../src/main/extension-manager";

const native = vi.hoisted(() => ({ focused: undefined as object | undefined }));
vi.mock("electron", () => ({
  BrowserWindow: { getFocusedWindow: () => native.focused },
}));

function fixture() {
  const window = {} as BrowserWindow;
  native.focused = window;
  const session = new AbortController();
  const owner = new AbortController();
  const epoch = new AbortController();
  let active: ExtensionTarget = {
    owner: window,
    signal: session.signal,
    sourceSessionId: "s1",
    terminalDirectory: "/first",
  };
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => (release = resolve));
  const admit = vi.fn(async (signal: AbortSignal, commit: () => void) => {
    await barrier;
    if (signal.aborted) throw new Error("unavailable");
    commit();
  });
  const request = createFilesTerminalDirectory({
    window,
    currentTarget: () => active,
    translator: () => translatorFor("en-US"),
    semanticInput: {
      request: vi.fn(async () => ({ ok: true })),
      confirmSelection: vi.fn(async () => true),
      subscribeSelection: () => () => {},
    },
    ownerSignal: owner.signal,
    epochSignal: epoch.signal,
    admit,
  });
  let visible = true;
  const context = { id: "view", isCurrentVisible: () => visible };
  return {
    window,
    session,
    admit,
    release,
    request: () =>
      request({ operation: "terminal-directory" }, context, owner.signal),
    hide() {
      visible = false;
    },
    selectSecond() {
      active = {
        owner: window,
        signal: new AbortController().signal,
        sourceSessionId: "s2",
        terminalDirectory: "/second",
      };
    },
  };
}

it("keeps the original reported path when selection changes during admission", async () => {
  const f = fixture();
  const pending = f.request();
  await vi.waitFor(() => expect(f.admit).toHaveBeenCalledOnce());
  f.selectSecond();
  f.release();
  await expect(pending).resolves.toEqual({ ok: true, directory: "/first" });
});

it.each<[string, (f: ReturnType<typeof fixture>) => void]>([
  ["its source ends", (f) => f.session.abort()],
  ["the Files view hides", (f) => f.hide()],
  ["its window loses focus", () => (native.focused = undefined)],
])("does not return a path when %s during admission", async (_, lose) => {
  const f = fixture();
  const pending = f.request();
  await vi.waitFor(() => expect(f.admit).toHaveBeenCalledOnce());
  lose(f);
  f.release();
  await expect(pending).rejects.toThrow("unavailable");
});
