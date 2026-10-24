// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAuxiliaryPanel,
  type AuxiliaryView,
} from "../../src/renderer/auxiliary-panel";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture(initialWidth = 1000) {
  let width = initialWidth;
  const content = document.createElement("div");
  const root = document.createElement("aside");
  content.append(root);
  document.body.append(content);
  vi.spyOn(content, "getBoundingClientRect").mockImplementation(
    () => ({ width }) as DOMRect,
  );
  const views: AuxiliaryView[] = [];
  const factories = ["a", "b"].map((id) => ({
    id,
    label: id.toUpperCase(),
    create: vi.fn(() => {
      const element = document.createElement("div");
      const input = document.createElement("input");
      element.append(input);
      const view = {
        element,
        activate: vi.fn(),
        deactivate: vi.fn(),
        focus: vi.fn(() => input.focus()),
        dispose: vi.fn(),
      };
      views.push(view);
      return view;
    }),
  }));
  const focusTerminal = vi.fn();
  const clipboard = {
    readText: vi.fn(async () => "paste\ntext"),
    writeText: vi.fn(async () => {}),
    confirmPaste: vi.fn(async () => true),
    requestContextMenu: vi.fn(),
  };
  const panel = createAuxiliaryPanel(root, {
    content,
    views: factories,
    focusTerminal,
    clipboard,
  });
  cleanups.push(panel.dispose);
  const separator = content.querySelector<HTMLElement>('[role="separator"]')!;
  const key = (
    key: string,
    target = separator,
    repeat = false,
    type = "keydown",
  ) => {
    const event = new KeyboardEvent(type, {
      key,
      repeat,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  };
  const size = (value: number) => {
    width = value;
    window.dispatchEvent(new Event("resize"));
  };
  const pointer = (type: string, id = 1, x = 500, extra = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, {
      pointerId: id,
      clientX: x,
      isPrimary: true,
      button: 0,
      ...extra,
    });
    separator.dispatchEvent(event);
  };
  separator.setPointerCapture = vi.fn();
  separator.hasPointerCapture = vi.fn(() => true);
  separator.releasePointerCapture = vi.fn();
  return {
    root,
    panel,
    views,
    factories,
    focusTerminal,
    clipboard,
    separator,
    key,
    size,
    pointer,
  };
}

describe("window auxiliary panel", () => {
  it("observes actual content and releases geometry callbacks without late mutation", () => {
    let changed!: () => void;
    const observe = vi.fn(),
      disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          changed = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const f = fixture();
    f.panel.toggle("a");
    expect(observe).toHaveBeenCalledExactlyOnceWith(f.root.parentElement);
    f.size(500);
    changed();
    expect(f.root.style.width).toBe("280px");
    f.panel.dispose();
    f.size(406);
    changed();
    expect(f.root.style.width).toBe("280px");
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("does not steal overlay focus when shrinking deactivates a blocked panel", () => {
    const f = fixture();
    f.panel.toggle("a");
    f.panel.setBlocked(true);
    f.size(405);
    expect(f.root.hidden).toBe(true);
    expect(f.focusTerminal).not.toHaveBeenCalled();
  });
  it("creates lazily, switches exclusively without terminal focus, and disposes once", () => {
    const f = fixture();
    expect(f.factories[0]!.create).not.toHaveBeenCalled();
    f.panel.toggle("a");
    expect(f.views[0]!.activate).toHaveBeenCalledOnce();
    f.panel.toggle("b");
    expect(f.views[0]!.deactivate).toHaveBeenCalledOnce();
    expect(f.views[0]!.element.hidden).toBe(true);
    expect(f.views[1]!.element.hidden).toBe(false);
    expect(f.focusTerminal).not.toHaveBeenCalled();
    f.panel.toggle("b");
    expect(f.root.hidden).toBe(true);
    expect(f.focusTerminal).toHaveBeenCalledOnce();
    f.panel.toggle("a");
    expect(f.factories[0]!.create).toHaveBeenCalledOnce();
    f.panel.dispose();
    f.panel.dispose();
    f.panel.toggle("b");
    for (const view of f.views) expect(view.dispose).toHaveBeenCalledOnce();
  });

  it("retains preferred width under automatic clamping and never auto-reopens", () => {
    const f = fixture();
    f.panel.toggle("a");
    expect(f.root.style.width).toBe("280px");
    f.key("End");
    expect(f.root.style.width).toBe("560px");
    f.size(500);
    expect(f.root.style.width).toBe("314px");
    f.size(406);
    expect(f.root.style.width).toBe("220px");
    f.size(1000);
    expect(f.root.style.width).toBe("560px");
    f.size(405);
    expect(f.root.hidden).toBe(true);
    expect(f.views[0]!.deactivate).toHaveBeenCalledOnce();
    f.panel.toggle("a");
    expect(document.querySelector('[role="status"]')!.textContent).toBe(
      "Widen the window to open A",
    );
    f.size(1000);
    expect(f.root.hidden).toBe(true);
    f.panel.toggle("a");
    expect(f.root.style.width).toBe("560px");
  });

  it("uses keyboard pixel limits, exposes values and consumes only separator resize keys", () => {
    const f = fixture(600);
    f.panel.toggle("a");
    expect(f.key("ArrowLeft").defaultPrevented).toBe(true);
    expect(f.root.style.width).toBe("290px");
    f.key("ArrowRight");
    f.key("Home");
    expect(f.root.style.width).toBe("220px");
    f.key("End");
    expect(f.separator.getAttribute("aria-valuemax")).toBe("414");
    expect(f.separator.getAttribute("aria-valuenow")).toBe("414");
    expect(f.separator.getAttribute("aria-valuetext")).toBe("414 pixels wide");
    expect(
      f.key("ArrowLeft", f.root.querySelector("input")!).defaultPrevented,
    ).toBe(false);
  });

  it.each([
    "pointerup",
    "pointercancel",
    "lostpointercapture",
    "hide",
    "switch",
    "overlay",
    "dispose",
  ])("ends capture and queued work on %s at the last valid width", (ending) => {
    const f = fixture();
    f.panel.toggle("a");
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancel = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});
    f.pointer("pointerdown", 8, 500, { button: 1 });
    expect(f.separator.setPointerCapture).not.toHaveBeenCalled();
    f.pointer("pointerdown");
    f.pointer("pointermove", 9, 450);
    expect(callbacks).toHaveLength(0);
    f.pointer("pointermove", 1, 450);
    f.pointer("pointermove", 1, 400);
    expect(callbacks).toHaveLength(1);
    expect(f.root.style.width).toBe("280px");
    if (ending === "hide") f.panel.toggle("a");
    else if (ending === "switch") f.panel.toggle("b");
    else if (ending === "overlay") f.panel.setBlocked(true);
    else if (ending === "dispose") f.panel.dispose();
    else f.pointer(ending);
    expect(cancel).toHaveBeenCalledOnce();
    expect(f.separator.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(
      1,
    );
    expect(f.root.style.width).toBe("380px");
    callbacks[0]!(0);
    f.pointer("pointermove", 1, 200);
    expect(f.root.style.width).toBe("380px");
    expect(f.separator.classList.contains("dragging")).toBe(false);
  });

  it("coalesces captured moves into a frame and clamps pointer resize at both limits", () => {
    const f = fixture();
    f.panel.toggle("a");
    let frame!: FrameRequestCallback;
    const request = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frame = callback;
        return 1;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    f.pointer("pointerdown", 2, 500, { isPrimary: false });
    expect(f.separator.setPointerCapture).not.toHaveBeenCalled();
    f.pointer("pointerdown");
    f.pointer("pointermove", 1, 100);
    f.pointer("pointermove", 1, 0);
    expect(request).toHaveBeenCalledOnce();
    frame(0);
    expect(f.root.style.width).toBe("560px");
    f.pointer("pointermove", 1, 1000);
    frame(0);
    expect(f.root.style.width).toBe("220px");
    f.pointer("pointerup", 9);
    expect(f.separator.classList.contains("dragging")).toBe(true);
    f.pointer("pointerup");
    expect(f.separator.classList.contains("dragging")).toBe(false);
  });

  it("isolates window widths and retains state when blocked without queuing actions", () => {
    const a = fixture(),
      b = fixture();
    a.panel.toggle("a");
    b.panel.toggle("a");
    a.key("End");
    expect(b.root.style.width).toBe("280px");
    a.panel.setBlocked(true);
    a.panel.toggle("a");
    a.panel.toggle("b");
    a.key("Home");
    a.root.querySelector<HTMLButtonElement>("button")!.click();
    expect(a.root.hidden).toBe(false);
    expect(a.root.inert).toBe(true);
    expect(a.factories[1]!.create).not.toHaveBeenCalled();
    a.panel.setBlocked(false);
    expect(a.root.style.width).toBe("560px");
    expect(a.views[0]!.activate).toHaveBeenCalledOnce();
  });

  it.each(["Escape", "Enter"])(
    "owns the complete %s dismissal gesture but not a fresh terminal key",
    (key) => {
      const f = fixture();
      f.panel.toggle("a");
      const target =
        key === "Enter"
          ? f.root.querySelector("button")!
          : f.root.querySelector("input")!;
      expect(f.key(key, target).defaultPrevented).toBe(true);
      expect(f.root.hidden).toBe(true);
      expect(f.key(key, document.body, true).defaultPrevented).toBe(true);
      expect(f.key(key, document.body, false, "keyup").defaultPrevented).toBe(
        true,
      );
      expect(f.key(key, document.body).defaultPrevented).toBe(false);
      expect(f.focusTerminal).toHaveBeenCalledOnce();
    },
  );

  it("edits the focused query and suppresses unsupported controls", async () => {
    const f = fixture();
    f.panel.toggle("a");
    const input = f.root.querySelector("input")!;
    input.value = "query";
    input.setSelectionRange(1, 4);
    expect(f.panel.clipboardAction("copy")).toBe(true);
    expect(f.clipboard.writeText).toHaveBeenCalledWith("uer");
    f.panel.clipboardAction("paste");
    await vi.waitFor(() => expect(input.value).toBe("qpaste texty"));
    f.panel.clipboardAction("select-all");
    expect(input.selectionEnd).toBe(input.value.length);
    f.separator.focus();
    expect(f.panel.clipboardAction("paste")).toBe(true);
    document.body.tabIndex = 0;
    document.body.focus();
    expect(f.panel.clipboardAction("paste")).toBe(false);
  });

  it.each(["blur", "hide", "switch", "overlay", "dispose"])(
    "discards clipboard completion after %s",
    async (ending) => {
      const f = fixture();
      f.panel.toggle("a");
      const input = f.root.querySelector("input")!;
      let complete!: (value: string) => void;
      f.clipboard.readText.mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      f.panel.clipboardAction("paste");
      if (ending === "blur") {
        input.blur();
        input.focus();
      }
      if (ending === "hide") {
        f.panel.toggle("a");
        f.panel.toggle("a");
      }
      if (ending === "switch") {
        f.panel.toggle("b");
        f.panel.toggle("a");
      }
      if (ending === "overlay") {
        f.panel.setBlocked(true);
        f.panel.setBlocked(false);
      }
      if (ending === "dispose") f.panel.dispose();
      complete("late");
      await Promise.resolve();
      expect(input.value).toBe("");
    },
  );
});
