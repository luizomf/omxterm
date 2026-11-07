// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page.js";
import type { BrowserWindow } from "electron";
import { createFilesTerminalDrag } from "../../src/main/files-terminal-drag";
import type { SupportedLanguage } from "../../src/shared/i18n.js";
type Reply = Awaited<
  ReturnType<Parameters<typeof mountFilesPage>[1]["request"]>
>;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function setup(
  transport: Pick<
    Parameters<typeof mountFilesPage>[1],
    "beginFilesTerminalDrag" | "endFilesTerminalDrag"
  > = {},
  root = "/root",
) {
  let handler:
    ((value: Record<string, string>) => Promise<Reply> | undefined) | undefined;
  const request = vi.fn(async (value: unknown): Promise<Reply> => {
    const input = value as Record<string, string>;
    const result = handler?.(input);
    if (result) return result;
    if (input.operation === "home") return { ok: true, directory: root };
    if (input.operation === "list")
      return {
        ok: true,
        directory: input.path!,
        rows: [
          { name: "folder", kind: "directory", size: 0 },
          { name: "alpha", kind: "file", size: 1 },
          { name: "beta", kind: "file", size: 1 },
        ],
      };
    return { ok: true };
  });
  let language!: (value: SupportedLanguage) => void;
  let visibility!: (visible: boolean) => void;
  let focusIntent!: (intent: "search" | "restore") => void;
  const page = mountFilesPage(document, {
    ...transport,
    request,
    onLanguage(listener) {
      language = listener;
      return () => {};
    },
    onVisibility(listener) {
      visibility = listener;
      listener(true);
      return () => {};
    },
    onFocusIntent(listener) {
      focusIntent = listener;
      return () => {};
    },
  });
  dispose = page.dispose;
  await page.ready;
  return {
    request,
    language,
    visibility,
    focusIntent,
    handle(value: typeof handler) {
      handler = value;
    },
  };
}
const row = (path: string) =>
  [...document.querySelectorAll<HTMLElement>(".file-row")].find(
    (node) => node.dataset.path === path,
  )!;
const menu = () => document.querySelector<HTMLElement>(".file-menu")!;
function button(label: string, scope: ParentNode = document) {
  const result = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) =>
      (node.getAttribute("aria-label") === label ||
        node.textContent === label) &&
      !node.closest("[hidden]"),
  );
  expect(result, label).toBeTruthy();
  return result!;
}
function context(path: string) {
  row(path).dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
}
function key(node: HTMLElement, value: string, shiftKey = false) {
  node.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: value,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}
function apply(value: string) {
  const form = document.querySelector<HTMLFormElement>(".operation-editor")!;
  form.querySelector("input")!.value = value;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
function transfer(external = false) {
  const data = new Map<string, string>();
  if (external) data.set("Files", "external");
  return {
    effectAllowed: "",
    dropEffect: "",
    get types() {
      return [...data.keys()];
    },
    clearData() {
      data.clear();
    },
    setData(type: string, value: string) {
      data.set(type, value);
    },
    getData(type: string) {
      return data.get(type) ?? "";
    },
  };
}
function dragEvent(
  node: HTMLElement,
  type: string,
  data: ReturnType<typeof transfer>,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: data });
  node.dispatchEvent(event);
}
function moveReply(value: Record<string, string>): Reply {
  return {
    ok: true,
    token: "move-token",
    path: value.path!,
    directory: value.directory!,
  };
}

it.each([false, true])(
  "offers copyMove with a registered ticket and keeps internal confirmation with Chromium metadata=%s",
  async (chromium) => {
    const ticket = "12345678-1234-1234-1234-123456789abc";
    const beginFilesTerminalDrag = vi.fn(() => ticket);
    const endFilesTerminalDrag = vi.fn();
    const { request, handle } = await setup({
      beginFilesTerminalDrag,
      endFilesTerminalDrag,
    });
    handle((value) =>
      value.operation === "prepare-move-into"
        ? Promise.resolve(moveReply(value))
        : undefined,
    );
    const data = transfer();
    data.setData("text/plain", "/must-not-escape");
    dragEvent(row("/root/alpha"), "dragstart", data);
    expect(beginFilesTerminalDrag).toHaveBeenCalledExactlyOnceWith({
      path: "/root/alpha",
      kind: "file",
      entryToken: "1",
    });
    expect(data.types).toEqual([
      "application/x-omxterm-files-entry",
      "application/x-omxterm-files-terminal",
    ]);
    expect(data.types.map((type) => data.getData(type)).join()).not.toContain(
      "/",
    );
    expect(data.effectAllowed).toBe("copyMove");
    if (chromium) data.setData("chromium/x-drag-id", "synthetic");
    dragEvent(row("/root/folder"), "dragover", data);
    expect(data.dropEffect).toBe("move");
    dragEvent(row("/root/folder"), "drop", data);
    expect(endFilesTerminalDrag).toHaveBeenCalledExactlyOnceWith(ticket);
    await vi.waitFor(() => expect(button("Move")).toBeTruthy());
    expect(request).toHaveBeenCalledWith({
      operation: "prepare-move-into",
      path: "/root/alpha",
      kind: "file",
      directory: "/root/folder",
    });
    expect(
      request.mock.calls.some(
        ([value]) => (value as { operation: string }).operation === "move-into",
      ),
    ).toBe(false);
    button("Cancel").click();
    expect(request).toHaveBeenCalledWith({
      operation: "cancel-move",
      token: "move-token",
    });
  },
);
it("keeps the original ticket for a completed native copy whose core claim is queued after child dragend", async () => {
  const root = process.platform === "win32" ? "C:/synthetic" : "/root";
  const transport = createFilesTerminalDrag({
    webContents: { isDestroyed: () => false },
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    isFocused: () => true,
  } as unknown as BrowserWindow);
  const source = { id: "visible-files", isCurrentVisible: () => true };
  const consume = vi.fn(async () => ({ status: "accepted" as const }));
  const end = vi.fn((ticket: string) => transport.end(source.id, ticket));
  await setup(
    {
      beginFilesTerminalDrag: (entry) =>
        transport.start(entry, source, new AbortController().signal, consume),
      endFilesTerminalDrag: end,
    },
    root,
  );
  const data = transfer();
  dragEvent(row(`${root}/alpha`), "dragstart", data);
  const ticket = data.getData("application/x-omxterm-files-terminal");
  data.dropEffect = "copy";
  dragEvent(row(`${root}/alpha`), "dragend", data);
  expect(transport.claim({ ticket, entryToken: "1" })).toBe(true);
  expect(end).not.toHaveBeenCalled();
  expect(await transport.handoff(ticket, 1)).toEqual({ status: "accepted" });
  expect(consume).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      entry: { path: `${root}/alpha`, kind: "file", entryToken: "1" },
    }),
  );
  expect(transport.claim({ ticket, entryToken: "1" })).toBe(false);
  expect(await transport.handoff(ticket, 1)).toEqual({ status: "refused" });
});
it.each([null, "forged"])(
  "keeps move-only semantics when terminal registration returns %s",
  async (ticket) => {
    await setup({
      beginFilesTerminalDrag: () => ticket,
      endFilesTerminalDrag: vi.fn(),
    });
    const data = transfer();
    dragEvent(row("/root/alpha"), "dragstart", data);
    expect(data.types).toEqual(["application/x-omxterm-files-entry"]);
    expect(data.effectAllowed).toBe("move");
  },
);
it.each(["dragend", "hide", "dispose"])(
  "revokes source ticket on %s without reading dragend DataTransfer",
  async (loss) => {
    const ticket = "12345678-1234-1234-1234-123456789abc";
    const endFilesTerminalDrag = vi.fn();
    const { visibility } = await setup({
      beginFilesTerminalDrag: () => ticket,
      endFilesTerminalDrag,
    });
    dragEvent(row("/root/alpha"), "dragstart", transfer());
    if (loss === "dragend") document.dispatchEvent(new Event("dragend"));
    else if (loss === "hide") visibility(false);
    else dispose?.();
    expect(endFilesTerminalDrag).toHaveBeenCalledExactlyOnceWith(ticket);
  },
);
it("confirms a captured internal drag without exporting a local path", async () => {
  const { handle, request, language } = await setup();
  const pending = deferred<Reply>();
  handle((value) =>
    value.operation === "prepare-move-into" ? pending.promise : undefined,
  );
  const data = transfer();
  dragEvent(row("/root/alpha"), "dragstart", data);
  expect(data.types).toEqual(["application/x-omxterm-files-entry"]);
  expect(data.getData(data.types[0]!)).not.toContain("/root");
  dragEvent(row("/root/folder"), "dragover", data);
  expect(data.dropEffect).toBe("move");
  expect(row("/root/folder").dataset.drop).toBe("valid");
  expect(document.querySelector(".drag-feedback")?.textContent).toContain(
    "folder",
  );
  dragEvent(row("/root/folder"), "drop", data);
  expect(request).toHaveBeenCalledWith({
    operation: "prepare-move-into",
    path: "/root/alpha",
    kind: "file",
    directory: "/root/folder",
  });
  row("/root/beta").click();
  pending.resolve({
    ok: true,
    token: "fixed",
    path: "/root/alpha",
    directory: "/root/folder",
  });
  await vi.waitFor(() =>
    expect(document.querySelector(".operation-editor")?.textContent).toContain(
      "Move /root/alpha into /root/folder?",
    ),
  );
  expect(document.activeElement).toBe(row("/root/beta"));
  language("pt-BR");
  expect(document.querySelector(".operation-editor")?.textContent).toContain(
    "Mover /root/alpha para /root/folder?",
  );
  button("Mover").click();
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      operation: "move-into",
      token: "fixed",
    }),
  );
  expect(
    request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "move-into",
    ),
  ).toHaveLength(1);
});

it("rejects external payloads, nondirectories and invalid internal destinations", async () => {
  const { request } = await setup();
  const external = transfer(true);
  external.setData("application/x-omxterm-files-entry", "forged");
  dragEvent(row("/root/folder"), "dragover", external);
  expect(external.dropEffect).toBe("none");
  expect(document.querySelector(".drag-feedback")?.textContent).toContain(
    "Only entries dragged within Files",
  );
  dragEvent(row("/root/folder"), "drop", external);
  const data = transfer();
  dragEvent(row("/root/folder"), "dragstart", data);
  dragEvent(row("/root/folder"), "dragover", data);
  expect(data.dropEffect).toBe("none");
  expect(row("/root/folder").dataset.drop).toBe("invalid");
  dragEvent(row("/root/folder"), "drop", data);
  const other = transfer();
  dragEvent(row("/root/alpha"), "dragstart", other);
  dragEvent(row("/root/beta"), "dragover", other);
  expect(other.dropEffect).toBe("none");
  dragEvent(row("/root/beta"), "drop", other);
  expect(
    request.mock.calls.filter(
      ([value]) =>
        (value as { operation: string }).operation === "prepare-move-into",
    ),
  ).toHaveLength(0);
});

it("provides a keyboard-accessible folder move with confirmation and cancellation", async () => {
  const { handle, request } = await setup();
  handle((value) =>
    value.operation === "prepare-move-into"
      ? Promise.resolve(moveReply(value))
      : undefined,
  );
  row("/root/alpha").focus();
  key(row("/root/alpha"), "F10", true);
  button("Move to folder…", menu()).click();
  row("/root/beta").click();
  apply("/root/folder");
  await vi.waitFor(() => expect(button("Move")).toBeTruthy());
  expect(request).toHaveBeenCalledWith({
    operation: "prepare-move-into",
    path: "/root/alpha",
    kind: "file",
    directory: "/root/folder",
  });
  button("Cancel").click();
  expect(request).toHaveBeenCalledWith({
    operation: "cancel-move",
    token: "move-token",
  });
  expect(
    request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "move-into",
    ),
  ).toHaveLength(0);
});

it.each(["conflict", "outcome-unknown"])(
  "consumes a failed %s confirmation without retry",
  async (error) => {
    const { handle, request } = await setup();
    handle((value) =>
      value.operation === "prepare-move-into"
        ? Promise.resolve(moveReply(value))
        : value.operation === "move-into"
          ? Promise.resolve({ ok: false, error })
          : undefined,
    );
    context("/root/alpha");
    button("Move to folder…", menu()).click();
    apply("/root/folder");
    await vi.waitFor(() => expect(button("Move")).toBeTruthy());
    const confirm = button("Move");
    confirm.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[role="status"]')?.textContent).toContain(
        error === "conflict" ? "already exists" : "Outcome unknown",
      ),
    );
    expect(
      document.querySelector<HTMLElement>(".operation-editor")?.hidden,
    ).toBe(true);
    confirm.click();
    expect(
      request.mock.calls.filter(
        ([value]) => (value as { operation: string }).operation === "move-into",
      ),
    ).toHaveLength(1);
  },
);

it("cancels a late preparation on disposal instead of showing or executing it", async () => {
  const { handle, request } = await setup();
  const pending = deferred<Reply>();
  handle((value) =>
    value.operation === "prepare-move-into" ? pending.promise : undefined,
  );
  context("/root/alpha");
  button("Move to folder…", menu()).click();
  apply("/root/folder");
  dispose?.();
  pending.resolve({
    ok: true,
    token: "late",
    path: "/root/alpha",
    directory: "/root/folder",
  });
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      operation: "cancel-move",
      token: "late",
    }),
  );
  expect(
    request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "move-into",
    ),
  ).toHaveLength(0);
});

it("keeps the source through a tree exit and a completed refresh", async () => {
  const { request, handle } = await setup();
  const data = transfer();
  const source = row("/root/alpha");
  handle((value) =>
    value.operation === "prepare-move-into"
      ? Promise.resolve(moveReply(value))
      : undefined,
  );
  dragEvent(source, "dragstart", data);
  dragEvent(row("/root/folder"), "dragover", data);
  const leave = new Event("dragleave", { bubbles: true });
  Object.defineProperty(leave, "relatedTarget", {
    value: document.querySelector(".entry-filter"),
  });
  row("/root/folder").dispatchEvent(leave);
  expect(document.querySelector<HTMLElement>(".drag-feedback")!.hidden).toBe(
    true,
  );
  button("Refresh").click();
  await vi.waitFor(() =>
    expect(
      request.mock.calls.filter(
        ([value]) => (value as { operation: string }).operation === "list",
      ),
    ).toHaveLength(2),
  );
  await Promise.resolve();
  expect(row("/root/alpha")).toBe(source);
  dragEvent(row("/root/folder"), "dragover", data);
  expect(data.dropEffect).toBe("move");
  dragEvent(row("/root/folder"), "drop", data);
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      operation: "prepare-move-into",
      path: "/root/alpha",
      kind: "file",
      directory: "/root/folder",
    }),
  );
  expect(row("/root/alpha")).not.toBe(source);
});

it("focuses Cancel after an inert-editor blur and on a hidden confirmation's reveal", async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const { handle, visibility, focusIntent } = await setup();
  const pending = deferred<Reply>();
  handle((value) =>
    value.operation === "prepare-move-into" ? pending.promise : undefined,
  );
  context("/root/alpha");
  button("Move to folder…", menu()).click();
  const input = document.querySelector<HTMLInputElement>(
    ".operation-editor input",
  )!;
  apply("/root/folder");
  input.blur(); // Model Chromium dropping focus when the editor becomes inert.
  pending.resolve({
    ok: true,
    token: "fixed",
    path: "/root/alpha",
    directory: "/root/folder",
  });
  await vi.waitFor(() =>
    expect(document.querySelector(".operation-editor")?.textContent).toContain(
      "Move /root/alpha into /root/folder?",
    ),
  );
  expect(document.activeElement).toBe(button("Cancel"));
  visibility(false);
  (document.activeElement as HTMLElement).blur();
  visibility(true);
  focusIntent("search");
  expect(document.activeElement).toBe(button("Cancel"));
  expect(document.querySelector(".operation-editor button")).toBe(
    button("Cancel"),
  );
});

it("does not steal focus after a deliberate gesture during preparation", async () => {
  const { handle } = await setup();
  const pending = deferred<Reply>();
  handle((value) =>
    value.operation === "prepare-move-into" ? pending.promise : undefined,
  );
  context("/root/alpha");
  button("Move to folder…", menu()).click();
  apply("/root/folder");
  const filter = document.querySelector<HTMLInputElement>(".entry-filter")!;
  filter.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  filter.focus();
  pending.resolve({
    ok: true,
    token: "fixed",
    path: "/root/alpha",
    directory: "/root/folder",
  });
  await vi.waitFor(() => expect(button("Move")).toBeTruthy());
  expect(document.activeElement).toBe(filter);
});
