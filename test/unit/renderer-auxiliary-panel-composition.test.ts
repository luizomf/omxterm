// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createAuxiliaryPanel } from "../../src/renderer/auxiliary-panel";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function fixture() {
  const content = document.createElement("div");
  const root = document.createElement("aside");
  const input = document.createElement("input");
  content.append(root);
  document.body.append(content);
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  const view = {
    element: input,
    activate: vi.fn(),
    deactivate: vi.fn(),
    focus: () => input.focus(),
    dispose: vi.fn(),
  };
  const focusTerminal = vi.fn();
  const panel = createAuxiliaryPanel(root, {
    content,
    views: [{ id: "snippets", label: "Snippets", create: () => view }],
    focusTerminal,
  });
  cleanups.push(panel.dispose);
  panel.show("snippets");
  input.value = "draft";
  input.focus();
  return { root, input, view, focusTerminal };
}

function escape(
  target: HTMLElement,
  init: KeyboardEventInit = {},
  type = "keydown",
) {
  const event = new KeyboardEvent(type, {
    key: "Escape",
    code: "Escape",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

it("leaves composing Escape and its unowned repeat to the focused built-in view", () => {
  const f = fixture();
  for (const init of [
    { isComposing: true },
    { isComposing: true, repeat: true },
    { isComposing: false, repeat: true },
  ]) {
    expect(escape(f.input, init).defaultPrevented).toBe(false);
    expect(f.root.hidden).toBe(false);
    expect(document.activeElement).toBe(f.input);
    expect(f.input.value).toBe("draft");
  }
  expect(escape(f.input, {}, "keyup").defaultPrevented).toBe(false);
  expect(f.view.deactivate).not.toHaveBeenCalled();
  expect(f.view.dispose).not.toHaveBeenCalled();
  expect(f.focusTerminal).not.toHaveBeenCalled();
  expect(escape(f.input).defaultPrevented).toBe(true);
  expect(f.root.hidden).toBe(true);
  expect(f.view.dispose).not.toHaveBeenCalled();
});

it("retains an owned Escape repeat and release even during composition", () => {
  const f = fixture();
  expect(escape(f.input).defaultPrevented).toBe(true);
  expect(f.root.hidden).toBe(true);
  expect(
    escape(document.body, { repeat: true, isComposing: true }).defaultPrevented,
  ).toBe(true);
  expect(
    escape(document.body, { isComposing: true }, "keyup").defaultPrevented,
  ).toBe(true);
  expect(f.focusTerminal).toHaveBeenCalledOnce();
  expect(escape(document.body).defaultPrevented).toBe(false);
});
