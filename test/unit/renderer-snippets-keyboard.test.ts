// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createInputHandler } from "restty/internal";
import { createAuxiliaryPanel } from "../../src/renderer/auxiliary-panel";
import { createSnippetsView } from "../../src/renderer/snippets-sidebar";
import { createSemanticInputDelivery } from "../../src/terminal-surface/semantic-input-delivery";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
async function setup(mode: number, execute = false) {
  const content = document.createElement("div"),
    root = document.createElement("aside"),
    terminal = document.createElement("textarea");
  content.append(terminal, root);
  document.body.append(content);
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  const keyboard: string[] = [],
    semantic: string[] = [];
  const encoder = createInputHandler({ getKittyKeyboardFlags: () => mode });
  const receive = (event: KeyboardEvent) => {
    if (
      document.activeElement !== terminal ||
      (event.type === "keyup" && !(mode & 2))
    )
      return;
    keyboard.push(encoder.mapKeyForPty(encoder.encodeKeyEvent(event)));
  };
  window.addEventListener("keydown", receive);
  window.addEventListener("keyup", receive);
  const delivery = createSemanticInputDelivery({
    isLive: () => true,
    isBracketedPasteEnabled: () => false,
    write: (text) => semantic.push(text),
  });
  const inject = vi.fn((snippet: { body: string; execute: boolean }) => {
    void delivery.deliver(snippet.body, { submit: snippet.execute });
    terminal.focus();
  });
  const panel = createAuxiliaryPanel(root, {
    content,
    focusTerminal: () => terminal.focus(),
    views: [
      {
        id: "snippets",
        label: "Snippets",
        create: (isInteractive) =>
          createSnippetsView(document, {
            isInteractive,
            inject,
            loadSnippets: async () => ({
              snippets: [
                { name: "Literal", body: " literal  $value ", execute },
              ],
            }),
          }),
      },
    ],
  });
  cleanups.push(() => {
    panel.dispose();
    delivery.dispose();
    window.removeEventListener("keydown", receive);
    window.removeEventListener("keyup", receive);
  });
  panel.toggle("snippets");
  await vi.waitFor(() =>
    expect(root.querySelector("li button")).not.toBeNull(),
  );
  const row = root.querySelector<HTMLButtonElement>("li button")!;
  const key = (type: string, code = "Enter", repeat = false) => {
    const event = new KeyboardEvent(type, {
      key: "Enter",
      code,
      location: code === "NumpadEnter" ? 3 : 0,
      repeat,
      bubbles: true,
      cancelable: true,
    });
    document.activeElement!.dispatchEvent(event);
    return event;
  };
  const activate = (code = "Enter") => {
    row.focus();
    expect(key("keydown", code).defaultPrevented).toBe(false);
    // jsdom has no native button activation. Model Chromium's default click
    // after uncancelled Enter keydown, before terminal-targeted repeat/release.
    row.click();
    expect(document.activeElement).toBe(terminal);
  };
  return { panel, row, terminal, keyboard, semantic, inject, key, activate };
}

it.each(
  [0, 3].flatMap((mode) =>
    [false, true].flatMap((execute) =>
      ["Enter", "NumpadEnter"].map((code) => ({ mode, execute, code })),
    ),
  ),
)(
  "owns row $code repeat/release in mode $mode without changing execute=$execute",
  async ({ mode, execute, code }) => {
    const f = await setup(mode, execute);
    f.activate(code);
    expect(f.key("keydown", code, true).defaultPrevented).toBe(true);
    expect(f.key("keyup", code).defaultPrevented).toBe(true);
    await vi.waitFor(() =>
      expect(f.semantic.join("")).toBe(
        ` literal  $value ${execute ? "\r" : ""}`,
      ),
    );
    expect(f.inject).toHaveBeenCalledOnce();
    expect(f.keyboard).toEqual([]);
    // A fresh terminal gesture, not the row's gesture, remains authoritative.
    f.key("keydown", code);
    f.key("keyup", code);
    expect(f.keyboard.join("")).toBe(
      mode === 3
        ? code === "NumpadEnter"
          ? "\u001b[57414;1:1u\u001b[57414;1:3u"
          : "\r\u001b[13;1:3u"
        : "\r",
    );
  },
);

it.each(["missed-release", "blur", "dispose"])(
  "recovers fresh terminal Enter after row activation and %s",
  async (ending) => {
    const f = await setup(3);
    f.activate();
    if (ending === "blur") window.dispatchEvent(new Event("blur"));
    if (ending === "dispose") f.panel.dispose();
    f.key("keydown");
    f.key("keyup");
    expect(f.keyboard.join("")).toBe("\r\u001b[13;1:3u");
  },
);

it("does not confuse a terminal keypad gesture with the row's held main Enter", async () => {
  const f = await setup(3);
  f.activate();
  f.key("keydown", "NumpadEnter");
  f.key("keyup", "NumpadEnter");
  expect(f.keyboard.join("")).toBe("\u001b[57414;1:1u\u001b[57414;1:3u");
  expect(f.key("keydown", "Enter", true).defaultPrevented).toBe(true);
  expect(f.key("keyup").defaultPrevented).toBe(true);
});
