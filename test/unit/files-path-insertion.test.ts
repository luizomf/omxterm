import { expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { translatorFor } from "../../src/shared/i18n";
import { createFilesPathInsertion } from "../../src/main/files-path-insertion";

const native = vi.hoisted(() => ({ focused: undefined as object | undefined }));
vi.mock("electron", () => ({
  BrowserWindow: { getFocusedWindow: () => native.focused },
}));

function fixture() {
  const window = {} as BrowserWindow;
  native.focused = window;
  const owner = new AbortController();
  const epoch = new AbortController();
  const request = vi.fn(async () => ({ ok: true }));
  const insert = createFilesPathInsertion({
    window,
    translator: () => translatorFor("en-US"),
    semanticInput: { request, confirmSelection: vi.fn() },
    platform: "linux",
    ownerSignal: owner.signal,
    epochSignal: epoch.signal,
    admit: vi.fn(),
  });
  let visible = true;
  const context = { id: "view", isCurrentVisible: () => visible };
  return {
    request,
    owner,
    insert: (path: string) =>
      insert({ operation: "insert-path", path }, context, owner.signal),
    hide() {
      visible = false;
    },
  };
}

it("inserts one quoted path and does not add Enter", async () => {
  const f = fixture();
  await expect(f.insert("/tmp/my file's.txt")).resolves.toEqual({ ok: true });
  expect(f.request).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    {
      operation: "terminal.semanticInput.v1",
      text: "'/tmp/my file'\\''s.txt'",
      title: "Insert path",
      intent: "insert",
      preview: false,
    },
    expect.anything(),
    expect.any(AbortSignal),
    expect.any(Function),
  );
});

it("refuses a relative path before asking the terminal", async () => {
  const f = fixture();
  await expect(f.insert("notes.txt")).resolves.toMatchObject({
    ok: false,
    reason: "terminal-path-invalid",
  });
  expect(f.request).not.toHaveBeenCalled();
});

it("reports a missing terminal without quoting a second mechanism", async () => {
  const f = fixture();
  f.request.mockResolvedValueOnce({ ok: false });
  await expect(f.insert("/tmp/notes.txt")).resolves.toMatchObject({
    ok: false,
    reason: "terminal-path-unavailable",
  });
});

it("keeps a changed terminal distinct from a second in-flight insertion", async () => {
  const f = fixture();
  let release!: () => void;
  f.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true });
      }),
  );
  const first = f.insert("/tmp/one.txt");
  await vi.waitFor(() => expect(f.request).toHaveBeenCalledOnce());
  await expect(f.insert("/tmp/two.txt")).resolves.toMatchObject({
    ok: false,
    reason: "terminal-path-busy",
  });
  f.hide();
  release();
  await expect(first).resolves.toMatchObject({
    ok: false,
    reason: "terminal-path-changed",
  });
});
