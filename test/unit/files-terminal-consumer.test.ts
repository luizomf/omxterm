// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import type { SemanticInputCommand } from "../../src/shared/semantic-input";
import {
  FILES_ENTRY_DRAG_TYPE,
  FILES_TERMINAL_DRAG_TYPE,
} from "../../src/shared/files-terminal-drag";
import type { TerminalSessionAdapter } from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";

const ticket = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const text = "'/synthetic/a '\\''b'\\'''";
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function drag(
  target: Element,
  type: string,
  extraTypes: string[] = [],
  files: File[] = [],
) {
  const data = {
    types: [FILES_ENTRY_DRAG_TYPE, FILES_TERMINAL_DRAG_TYPE, ...extraTypes],
    files,
    getData: (type: string) => (type === FILES_ENTRY_DRAG_TYPE ? "1" : ticket),
    dropEffect: "none",
  };
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 20,
    clientY: 20,
  });
  Object.defineProperty(event, "dataTransfer", { value: data });
  target.dispatchEvent(event);
  return { event, data };
}
async function fixture() {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  document.body.replaceChildren();
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("div");
  document.body.append(tabStrip, tabsContainer);
  const surfaces: {
    canvas: HTMLCanvasElement;
    inject: ReturnType<typeof vi.fn>;
    injectTracked: ReturnType<typeof vi.fn>;
    focusInput: ReturnType<typeof vi.fn>;
  }[] = [];
  let command!: (command: TerminalTabCommand) => void;
  let semantic!: (command: SemanticInputCommand) => void;
  let revision = -1;
  let finish!: (delivered: boolean) => void;
  let finishHandoff!: (result: { status: "accepted" | "unknown" }) => void;
  const bridge = {
    claim: vi.fn(() => true),
    handoff: vi.fn(
      (_ticket: string, _revision: number) =>
        new Promise<{ status: "accepted" | "unknown" }>((resolve) => {
          finishHandoff = resolve;
        }),
    ),
  };
  const nativeFormat = vi.fn(() => "must not be used");
  let session = 0;
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      page: window,
      createAdapter: () => {
        const id = `s${++session}`;
        return {
          sessionId: () => id,
          start: vi.fn(async () => {}),
          write: vi.fn(),
          resize: vi.fn(),
          close: vi.fn(),
        };
      },
      subscribeToTabCommands(listener) {
        command = listener;
        return () => {};
      },
      semanticInput: {
        selection(value) {
          revision = value;
        },
        onCommand(listener) {
          semantic = listener;
          return () => {};
        },
        reply(value) {
          if (value.kind === "finished")
            finishHandoff?.({
              status: value.available ? "accepted" : "unknown",
            });
        },
      },
      filesTerminalDrag: bridge,
      droppedFilePathInsertion: nativeFormat,
      mount: vi.fn(
        async (
          container: HTMLElement,
          _adapter: TerminalSessionAdapter,
          options: TerminalSurfaceOptions,
        ) => {
          _adapter.resize({ cols: 120, rows: 40 });
          vi.spyOn(
            container.closest<HTMLElement>(".terminal-tab")!,
            "getBoundingClientRect",
          ).mockReturnValue(new DOMRect(10, 10, 1200, 800));
          const canvas = document.createElement("canvas");
          container.append(canvas);
          vi.spyOn(container, "getBoundingClientRect").mockReturnValue(
            new DOMRect(10, 10, 400, 300),
          );
          const surface = {
            canvas,
            dispose: vi.fn(),
            focus: vi.fn(),
            focusInput: vi.fn(),
            geometry: () => ({
              cellWidth: 10,
              cellHeight: 20,
              insetWidth: 0,
              insetHeight: 0,
            }),
            applyConfiguration: vi.fn(),
            applyTheme: vi.fn(),
            inject: vi.fn(async () => {}),
            injectTracked: vi.fn(() => {
              options.onSemanticInput?.();
              return new Promise<boolean>((resolve) => {
                finish = resolve;
              });
            }),
            zoom: vi.fn(),
            copy: vi.fn(async () => {}),
            paste: vi.fn(async () => {}),
            selectAll: vi.fn(),
            find: vi.fn(),
          };
          surfaces.push(surface);
          return surface;
        },
      ),
    },
  );
  cleanups.push(host.dispose);
  await host.ready;
  const deliver = (dropTicket = ticket) =>
    semantic({
      kind: "request",
      id: requestId,
      source: "33333333-3333-4333-8333-333333333333",
      revision,
      waitForDelivery: true,
      dropTicket,
      input: {
        operation: "terminal.semanticInput.v1",
        text,
        title: "File path",
        intent: "insert",
        preview: false,
      },
    });
  return {
    host,
    surfaces,
    bridge,
    tabStrip,
    tabsContainer,
    nativeFormat,
    deliver,
    finish: (ok: boolean) => finish(ok),
    command: (value: TerminalTabCommand) => command(value),
  };
}

it("advertises only a bounded path-free copy candidate and clears it on leave", async () => {
  const f = await fixture();
  const { event, data } = drag(f.surfaces[0]!.canvas, "dragover");
  expect(event.defaultPrevented).toBe(true);
  expect(data.dropEffect).toBe("copy");
  const hint = document.querySelector(".files-terminal-drop-hint")!;
  expect(hint.textContent).toBe("Drop to insert path (not run)");
  expect(hint.textContent).not.toContain("synthetic");
  expect(f.bridge.claim).not.toHaveBeenCalled(); // candidate != authorization
  drag(f.surfaces[0]!.canvas, "dragleave");
  expect(hint.isConnected).toBe(false);
});

it.each([false, true])(
  "claims in the drop turn with Chromium metadata=%s, then delivers only to its retained Surface without Enter",
  async (chromium) => {
    const f = await fixture();
    const metadata = chromium ? ["chromium/x-drag-id"] : [];
    expect(
      drag(f.surfaces[0]!.canvas, "dragover", metadata).data.dropEffect,
    ).toBe("copy");
    drag(f.surfaces[0]!.canvas, "drop", metadata);
    expect(f.bridge.claim).toHaveBeenCalledExactlyOnceWith({
      ticket,
      entryToken: "1",
    });
    expect(f.bridge.handoff).not.toHaveBeenCalled();
    // Native child dragend is not cancellation of an already-claimed drop.
    document.dispatchEvent(new Event("dragend", { bubbles: true }));
    await vi.waitFor(() => expect(f.bridge.handoff).toHaveBeenCalledOnce());
    f.deliver();
    expect(f.surfaces[0]!.injectTracked).toHaveBeenCalledExactlyOnceWith(text);
    expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
    expect(f.nativeFormat).not.toHaveBeenCalled();
    f.finish(true);
    await Promise.resolve();
    f.deliver(); // a duplicate command cannot acquire another capture
    expect(f.surfaces[0]!.injectTracked).toHaveBeenCalledOnce();
  },
);

it.each([
  "text/plain",
  "text/uri-list",
  "Files",
  "application/x-omxterm-tab",
  "unexpected",
])(
  "refuses mixed %s without native-file fallback or any terminal delivery",
  async (type) => {
    const f = await fixture();
    const { data } = drag(f.surfaces[0]!.canvas, "dragover", [type]);
    expect(data.dropEffect).toBe("none");
    drag(f.surfaces[0]!.canvas, "drop", [type], [new File([], "synthetic")]);
    expect(f.bridge.claim).not.toHaveBeenCalled();
    expect(f.nativeFormat).not.toHaveBeenCalled();
    expect(f.surfaces[0]!.injectTracked).not.toHaveBeenCalled();
  },
);

it("keeps chrome, unfocused siblings and search controls inert; only the focused visible terminal area is eligible", async () => {
  const f = await fixture();
  f.command({ action: "split", direction: "right" });
  await vi.waitFor(() => expect(f.surfaces).toHaveLength(2));
  const search = document.createElement("div");
  search.setAttribute("role", "search");
  f.surfaces[1]!.canvas.parentElement!.append(search);
  for (const target of [f.tabStrip, f.surfaces[0]!.canvas, search]) {
    expect(drag(target, "dragover").data.dropEffect).toBe("none");
    drag(target, "drop");
  }
  expect(f.bridge.claim).not.toHaveBeenCalled();
  expect(drag(f.surfaces[1]!.canvas, "dragover").data.dropEffect).toBe("copy");
});

it.each(["selection", "close", "focus", "dispose"])(
  "refuses a captured drop after %s changes before admission, without retargeting",
  async (cause) => {
    const f = await fixture();
    drag(f.surfaces[0]!.canvas, "drop");
    await vi.waitFor(() => expect(f.bridge.handoff).toHaveBeenCalledOnce());
    if (cause === "selection") {
      f.command({ action: "new" });
      await vi.waitFor(() => expect(f.surfaces).toHaveLength(2));
    }
    if (cause === "close") f.command({ action: "close" });
    if (cause === "focus") {
      const input = document.createElement("input");
      document.body.append(input);
      input.focus();
    }
    if (cause === "dispose") f.host.dispose();
    f.deliver();
    expect(
      f.surfaces.every(
        (surface) => surface.injectTracked.mock.calls.length === 0,
      ),
    ).toBe(true);
  },
);

it("refuses a second handoff and a forged capture identifier instead of recapturing the selected pane", async () => {
  const f = await fixture();
  drag(f.surfaces[0]!.canvas, "drop");
  await vi.waitFor(() => expect(f.bridge.handoff).toHaveBeenCalledOnce());
  expect(drag(f.surfaces[0]!.canvas, "dragover").data.dropEffect).toBe("none");
  drag(f.surfaces[0]!.canvas, "drop");
  expect(f.bridge.claim).toHaveBeenCalledOnce();
  f.deliver("44444444-4444-4444-8444-444444444444");
  expect(f.surfaces[0]!.injectTracked).not.toHaveBeenCalled();
});
