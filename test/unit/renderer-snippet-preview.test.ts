// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createSnippetPreview } from "../../src/renderer/snippet-preview";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  document.body.replaceChildren();
});

const BODY = "  printf '%s'  {name} $HOME\n\ngit status --short\n";

function fixture(options: { canOpen?: () => boolean } = {}) {
  let live = true;
  const listeners = new Set<() => void>();
  const target = {
    live: () => live,
    onUnavailable(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    deliver: vi.fn(),
  };
  const focusTerminal = vi.fn();
  const onActivityChange = vi.fn();
  const preview = createSnippetPreview(document, {
    canOpen: options.canOpen ?? (() => true),
    focusTerminal,
    onActivityChange,
  });
  const returnFocus = vi.fn(() => true);
  const open = (execute: boolean) =>
    preview.open(
      { name: "status", description: "Show changes", body: BODY, execute },
      target,
      returnFocus,
    );
  const button = (name: string) =>
    document.querySelector<HTMLButtonElement>(`.snippet-preview-${name}`)!;
  return {
    preview,
    target,
    focusTerminal,
    onActivityChange,
    returnFocus,
    open,
    button,
    closeTab: () => {
      live = false;
      for (const listener of listeners) listener();
    },
  };
}

describe("snippet preview", () => {
  it("shows the exact body and focuses the snippet's default action", () => {
    const f = fixture();
    f.open(true);
    expect(document.querySelector("pre")!.textContent).toBe(BODY);
    expect(document.querySelector("h2")!.textContent).toBe("status");
    expect(document.activeElement).toBe(f.button("run"));
    expect(f.button("insert").textContent).toBe("Insert — no added Enter");
    expect(f.button("run").textContent).toBe("Run — adds Enter");
    expect(f.onActivityChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.target.deliver).not.toHaveBeenCalled();
    f.preview.dispose();

    const g = fixture();
    g.open(false);
    expect(document.activeElement).toBe(g.button("insert"));
  });

  it.each([
    [true, "insert", false],
    [false, "run", true],
  ] as const)(
    "lets the final choice override execute=%s (%s) and accepts it once",
    (execute, choice, submit) => {
      const f = fixture();
      f.open(execute);
      const chosen = f.button(choice);
      chosen.click();
      chosen.click();
      expect(f.target.deliver).toHaveBeenCalledExactlyOnceWith(BODY, submit);
      expect(document.querySelector("dialog")).toBeNull();
      expect(f.onActivityChange).toHaveBeenLastCalledWith(false);
      expect(f.focusTerminal).toHaveBeenCalledOnce();
      expect(f.preview.isActive()).toBe(false);
    },
  );

  it("cancels without delivery and restores the opening control or the terminal", () => {
    const f = fixture();
    f.open(true);
    f.button("cancel").click();
    expect(f.target.deliver).not.toHaveBeenCalled();
    expect(f.returnFocus).toHaveBeenCalledOnce();
    expect(f.focusTerminal).not.toHaveBeenCalled();

    f.returnFocus.mockReturnValue(false);
    f.open(false);
    document
      .querySelector("dialog")!
      .dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(document.querySelector("dialog")).toBeNull();
    expect(f.target.deliver).not.toHaveBeenCalled();
    expect(f.focusTerminal).toHaveBeenCalledOnce();
  });

  it("disables its actions when the captured terminal closes and sends nothing", async () => {
    const f = fixture();
    f.open(true);
    f.closeTab();
    await vi.waitFor(() => expect(f.button("run").disabled).toBe(true));
    expect(f.button("insert").disabled).toBe(true);
    expect(document.querySelector('[role="status"]')!.textContent).toContain(
      "Nothing will be sent",
    );
    f.button("run").disabled = false;
    f.button("run").click();
    expect(f.target.deliver).not.toHaveBeenCalled();
  });

  it("ignores competing opens, dead targets and use after disposal", () => {
    let blocked = true;
    const f = fixture({ canOpen: () => !blocked });
    f.open(true);
    expect(document.querySelector("dialog")).toBeNull();
    blocked = false;
    f.open(true);
    f.open(false);
    expect(document.querySelectorAll("dialog")).toHaveLength(1);
    expect(f.onActivityChange).toHaveBeenCalledOnce();
    f.preview.dispose();
    expect(document.querySelector("dialog")).toBeNull();
    expect(f.focusTerminal).not.toHaveBeenCalled();
    expect(f.returnFocus).not.toHaveBeenCalled();
    f.open(true);
    expect(document.querySelector("dialog")).toBeNull();

    const g = fixture();
    g.closeTab();
    g.open(true);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("retains the accepting Enter's repeats and release from the terminal", () => {
    const f = fixture();
    f.open(true);
    const reachedPage = vi.fn();
    window.addEventListener("keydown", reachedPage);
    window.addEventListener("keyup", reachedPage);
    try {
      const run = f.button("run");
      run.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
        }),
      );
      run.click();
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          repeat: true,
        }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Enter", code: "Enter" }),
      );
      expect(reachedPage).not.toHaveBeenCalled();
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }),
      );
      expect(reachedPage).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("keydown", reachedPage);
      window.removeEventListener("keyup", reachedPage);
      f.preview.dispose();
    }
  });
});
