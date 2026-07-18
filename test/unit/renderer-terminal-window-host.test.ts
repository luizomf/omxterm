// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalFontZoom } from "../../src/shared/terminal-contract";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";

function createAdapter() {
  return {
    start: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  };
}

function createSurface(overrides: Record<string, unknown> = {}) {
  return {
    dispose: vi.fn(),
    focus: vi.fn(),
    zoom: vi.fn(),
    copy: vi.fn(async () => undefined),
    paste: vi.fn(async () => undefined),
    selectAll: vi.fn(),
    ...overrides,
  };
}

describe("renderer Terminal Window page host", () => {
  it("focuses a successfully mounted Surface when its page is active", async () => {
    const focus = vi.fn();
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      {
        page: window,
        mount: vi.fn(async () => createSurface({ focus })),
      },
    );

    await host.ready;

    expect(focus).toHaveBeenCalledOnce();
    hasFocus.mockRestore();
    host.dispose();
  });

  it("focuses only after an inactive page becomes active", async () => {
    const focus = vi.fn();
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      {
        page: window,
        mount: vi.fn(async () => createSurface({ focus })),
      },
    );

    window.dispatchEvent(new Event("focus"));
    await host.ready;
    expect(focus).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("focus"));
    expect(focus).toHaveBeenCalledOnce();

    hasFocus.mockRestore();
    host.dispose();
  });

  it("removes page activation focus on disposal", async () => {
    const focus = vi.fn();
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      {
        page: window,
        mount: vi.fn(async () => createSurface({ focus })),
      },
    );
    await host.ready;

    host.dispose();
    window.dispatchEvent(new Event("focus"));

    expect(focus).not.toHaveBeenCalled();
    hasFocus.mockRestore();
  });

  it("disposes the mounted Surface exactly once on page teardown", async () => {
    const dispose = vi.fn();
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      {
        page: window,
        mount: vi.fn(async () => createSurface({ dispose })),
      },
    );
    await host.ready;

    window.dispatchEvent(new Event("pagehide"));
    host.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("disposes a Surface that mounts after page teardown", async () => {
    const dispose = vi.fn();
    let finishMount: ((surface: TerminalSurface) => void) | undefined;
    const pendingMount = new Promise<TerminalSurface>((resolve) => {
      finishMount = resolve;
    });
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      {
        page: window,
        mount: vi.fn(() => pendingMount),
      },
    );

    window.dispatchEvent(new Event("pagehide"));
    finishMount!(createSurface({ dispose }));
    await host.ready;
    host.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("applies supplied appearance and independent native zoom to its Surface", async () => {
    const zoom = vi.fn();
    const listeners = new Set<(command: TerminalFontZoom) => void>();
    const removeZoomListener = vi.fn((listener) => listeners.delete(listener));
    const mount = vi.fn(async () => createSurface({ zoom }));
    const configuration = {
      fontSize: 19,
      fontLineHeight: 1.2,
      terminalPadding: { top: 4, right: 12, bottom: 6, left: 14 },
      fontFamily: "SF Mono",
      scrollbackLines: 2_000,
      optionKeyMode: "right",
    } as const;
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      {
        configuration,
        page: window,
        mount,
        subscribeToFontZoom(listener) {
          listeners.add(listener);
          return () => removeZoomListener(listener);
        },
      },
    );
    await host.ready;

    for (const listener of listeners) listener("in");

    expect(mount).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.any(Object),
      {
        appearance: {
          fontSize: 19,
          lineHeight: 1.2,
          systemFont: { family: "SF Mono", available: true },
        },
        padding: { top: 4, right: 12, bottom: 6, left: 14 },
        scrollbackLines: 2_000,
        optionKeyMode: "right",
      },
    );
    expect(zoom).toHaveBeenCalledWith("in");

    host.dispose();
    expect(removeZoomListener).toHaveBeenCalledOnce();
  });

  it("routes native clipboard actions to the selected mounted Surface", async () => {
    let actionListener:
      ((action: "copy" | "paste" | "select-all") => void) | undefined;
    const surface = createSurface();
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      {
        page: window,
        mount: vi.fn(async () => surface),
        subscribeToClipboardActions(listener) {
          actionListener = listener;
          return vi.fn();
        },
      },
    );
    await host.ready;

    actionListener!("copy");
    actionListener!("paste");
    actionListener!("select-all");

    expect(surface.copy).toHaveBeenCalledOnce();
    expect(surface.paste).toHaveBeenCalledOnce();
    expect(surface.selectAll).toHaveBeenCalledOnce();
    host.dispose();
  });

  it("passes title and BEL signals into the portable Surface", async () => {
    const onTitleRequest = vi.fn();
    const onBell = vi.fn();
    const onExternalLink = vi.fn();
    const mount = vi.fn(async () => createSurface());
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      { page: window, mount, onTitleRequest, onBell, onExternalLink },
    );
    await host.ready;

    expect(mount).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.any(Object),
      { onTitleRequest, onBell, onExternalLink },
    );
    host.dispose();
  });
});
