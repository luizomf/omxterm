import { vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import type {
  LocalImageActivation,
  LocalImageData,
} from "../../src/shared/local-image";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";
import { createFakeSurface } from "./terminal-tabs-harness";
import { installSettingsDom } from "./settings-dialog-dom";

export function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export const selectedImage: LocalImageData = {
  name: "fixture.png",
  mime: "image/png",
  width: 1,
  height: 1,
  data: new Uint8Array([1]),
};

// Actual host, tabs, panes and image owner; only native/Surface/decoder ports vary.
export async function modalSelectionWindow() {
  installSettingsDom();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const loaded = gate<LocalImageData | null>();
  const decoded = gate<void>();
  const decode = vi.fn(() => decoded.promise);
  const loadImage = vi.fn((_source?: LocalImageActivation) => loaded.promise);
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: decode,
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:modal-selection");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("div");
  document.body.replaceChildren(tabStrip, tabsContainer);
  let command!: (command: TerminalTabCommand) => void;
  let openImage!: () => void;
  const surfaces: ReturnType<typeof createFakeSurface>[] = [];
  const fields: { terminal: HTMLTextAreaElement; search: HTMLInputElement }[] =
    [];
  const handlers: TerminalSessionHandlers[] = [];
  const mountedOptions: TerminalSurfaceOptions[] = [];
  const blockedAtFocus: boolean[] = [];
  const notifySelection = vi.fn();
  const notifyEmpty = vi.fn();
  let next = 0;
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      createAdapter() {
        const index = next++;
        let started = false;
        return {
          sessionId: () => (started ? `s${index + 1}` : undefined),
          start: async (value: TerminalSessionHandlers) => {
            handlers[index] = value;
            started = true;
          },
          write: vi.fn(),
          resize: vi.fn(),
          close: vi.fn(),
        };
      },
      async mount(container, adapter, options) {
        vi.spyOn(
          container.closest<HTMLElement>(".terminal-tab")!,
          "getBoundingClientRect",
        ).mockReturnValue({ width: 1200, height: 800 } as DOMRect);
        const terminal = document.createElement("textarea");
        const search = document.createElement("input");
        container.append(terminal, search);
        const surface = createFakeSurface();
        surface.focus.mockImplementation(() => {
          blockedAtFocus.push(tabsContainer.inert === true);
          terminal.focus();
        });
        fields.push({ terminal, search });
        surfaces.push(surface);
        mountedOptions.push(options);
        await adapter.start({
          onOutput() {},
          onExit() {
            surface.dispose();
          },
        });
        adapter.resize({ cols: 120, rows: 40 });
        return surface;
      },
      notifyTabSelection: notifySelection,
      notifyTabsEmpty: notifyEmpty,
      onSurfaceFailure: vi.fn(),
      subscribeToTabCommands(listener) {
        command = listener;
        return () => {};
      },
      loadLocalImage: loadImage,
      subscribeToLocalImageOpen(listener) {
        openImage = listener;
        return () => {};
      },
    },
  );
  await host.ready;
  command({ action: "split", direction: "right" });
  // All mounts start synchronously through their supplied Adapter, then settle.
  await vi.waitFor(() => {
    if (!surfaces[1]?.focus.mock.calls.length) throw new Error("B not mounted");
  });
  command({ action: "new" });
  await vi.waitFor(() => {
    if (!surfaces[2]?.focus.mock.calls.length) throw new Error("C not mounted");
  });
  command({ action: "select", position: 1 });
  for (const surface of surfaces) surface.focus.mockClear();
  blockedAtFocus.length = 0;
  return {
    host,
    command,
    openImage,
    loadImage,
    loaded,
    decoded,
    decode,
    tabStrip,
    tabsContainer,
    surfaces,
    fields,
    handlers,
    mountedOptions,
    notifySelection,
    notifyEmpty,
    blockedAtFocus,
    async dispose() {
      host.dispose();
      loaded.resolve(null);
      decoded.resolve();
      await loaded.promise;
      await decoded.promise;
      await Promise.resolve();
    },
  };
}
