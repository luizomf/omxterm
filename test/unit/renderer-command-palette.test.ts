// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createCommandPalette } from "../../src/renderer/command-palette";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import type { PaletteSnapshot } from "../../src/shared/command-palette";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  document.body.replaceChildren();
});
const catalog: PaletteSnapshot = {
  token: "one",
  actions: [
    { id: "settings", label: "Configurações", accelerator: null },
    { id: "zoom", label: "Ampliar", accelerator: "Ctrl++" },
  ],
};
function setup(delayed = false) {
  let open!: () => void;
  let guard: ((token: string) => boolean) | undefined;
  let resolve!: (value: PaletteSnapshot) => void;
  let current = true;
  const prior = document.createElement("input");
  document.body.append(prior);
  prior.focus();
  const language = createRendererLanguage("pt-BR");
  const invoke = vi.fn(async () => {});
  const fallback = vi.fn();
  const clipboard = {
    readText: vi.fn(async () => "Ampliar"),
    confirmPaste: vi.fn(async () => true),
    requestContextMenu: vi.fn(),
    writeText: vi.fn(async () => {}),
  };
  const palette = createCommandPalette(document, {
    bridge: {
      snapshot: () =>
        delayed
          ? new Promise((done) => {
              resolve = done;
            })
          : Promise.resolve(catalog),
      invoke,
      onOpen: (listener) => {
        open = listener;
        return () => {};
      },
      setDispatchGuard: (next) => {
        guard = next;
      },
    },
    language,
    captureTarget: () => ({ isCurrent: () => current }),
    canOpen: () => true,
    onActivityChange: () => {},
    focusSelected: fallback,
    clipboard,
  });
  cleanups.push(palette.dispose);
  return {
    palette,
    open,
    invoke,
    prior,
    fallback,
    language,
    clipboard,
    resolve: () => resolve(catalog),
    invalidate: () => {
      current = false;
    },
    allowed: (token: string) => guard?.(token),
  };
}
function key(type: string, name: string, repeat = false) {
  const event = new KeyboardEvent(type, {
    key: name,
    code: name,
    repeat,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement!.dispatchEvent(event);
  return event;
}
const query = () =>
  document.querySelector<HTMLInputElement>("[role=combobox]")!;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
it("filters localized labels case-insensitively, navigates and announces empty results", async () => {
  const h = setup();
  h.open();
  await flush();
  expect(query().placeholder).toBe("Buscar ações…");
  key("keydown", "ArrowUp");
  expect(query().getAttribute("aria-activedescendant")).toBe(
    "command-palette-option-1",
  );
  query().value = "CONFIGURAÇÕES";
  query().dispatchEvent(new Event("input"));
  expect(document.querySelectorAll("[role=option]")).toHaveLength(1);
  query().value = "missing";
  query().dispatchEvent(new Event("input"));
  expect(document.querySelector("[role=status]")?.textContent).toBe(
    "Nenhuma ação encontrada",
  );
  h.language.set("en-US");
  expect(document.querySelector("[role=status]")?.textContent).toBe(
    "No matching actions",
  );
  key("keydown", "Enter");
  expect(h.invoke).not.toHaveBeenCalled();
});
it("shows shortcuts as quiet text and keeps one active row, moved by keys or a real pointer move", async () => {
  const h = setup();
  h.open();
  await flush();
  const rows = () => [
    ...document.querySelectorAll<HTMLElement>("[role=option]"),
  ];
  const active = () =>
    rows()
      .filter((row) => row.getAttribute("aria-selected") === "true")
      .map((row) => rows().indexOf(row));
  expect(rows()[1]!.querySelector(".ui-shortcut")?.textContent).toBe("Ctrl++");
  expect(document.querySelector(".ui-chip")).toBeNull();
  expect(active()).toEqual([0]);

  const move = (row: HTMLElement, x: number, y: number) =>
    row.dispatchEvent(
      new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true }),
    );
  move(rows()[1]!, 5, 5);
  expect(active()).toEqual([1]);
  expect(query().getAttribute("aria-activedescendant")).toBe(
    "command-palette-option-1",
  );
  key("keydown", "ArrowUp");
  expect(active()).toEqual([0]);
  // The list scrolling under a parked pointer repeats the same position.
  move(rows()[1]!, 5, 5);
  expect(active()).toEqual([0]);
  move(rows()[1]!, 6, 5);
  expect(active()).toEqual([1]);
});
it("settles held Enter and accepts delayed notification after the invoke reply", async () => {
  const h = setup();
  h.open();
  await flush();
  let complete!: () => void;
  h.invoke.mockImplementation(() => {
    expect(document.querySelector("dialog")).toBeNull();
    expect(h.allowed("one")).toBe(true);
    expect(h.allowed("other")).toBe(false);
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  key("keydown", "Enter");
  expect(document.activeElement).toBe(h.prior);
  expect(h.invoke).not.toHaveBeenCalled();
  expect(key("keydown", "Enter", true).defaultPrevented).toBe(true);
  expect(key("keyup", "Enter").defaultPrevented).toBe(true);
  expect(h.invoke).toHaveBeenCalledWith("one", "settings");
  expect(h.allowed("one")).toBe(true);
  complete();
  await flush();
  expect(h.allowed("one")).toBe(true);
  h.invalidate();
  expect(h.allowed("one")).toBe(false);
});
it("ignores delayed lists after target invalidation or cancellation", async () => {
  const h = setup(true);
  h.open();
  h.invalidate();
  h.resolve();
  await flush();
  expect(document.querySelector("dialog")).toBeNull();
  expect(h.fallback).not.toHaveBeenCalled();
  expect(h.invoke).not.toHaveBeenCalled();
  const next = setup(true);
  next.open();
  key("keydown", "Escape");
  next.resolve();
  await flush();
  expect(document.querySelector("dialog")).toBeNull();
});
it.each(["stale", "blur", "reopen"])(
  "does not invoke after Enter when %s intervenes",
  async (reason) => {
    const h = setup();
    h.open();
    await flush();
    key("keydown", "Enter");
    if (reason === "stale") h.invalidate();
    else if (reason === "blur") window.dispatchEvent(new Event("blur"));
    else h.open();
    key("keyup", "Enter");
    expect(h.invoke).not.toHaveBeenCalled();
  },
);
it("restores eligible prior focus and retains Escape repeats/release", async () => {
  const h = setup();
  h.open();
  await flush();
  key("keydown", "Escape");
  expect(document.activeElement).toBe(h.prior);
  expect(key("keydown", "Escape", true).defaultPrevented).toBe(true);
  expect(key("keyup", "Escape").defaultPrevented).toBe(true);
  expect(key("keydown", "Escape").defaultPrevented).toBe(false);
});
it.each(["hidden", "removed", "disabled"])(
  "does not restore a %s control",
  async (reason) => {
    const h = setup();
    h.open();
    await flush();
    if (reason === "hidden") h.prior.hidden = true;
    else if (reason === "disabled") h.prior.disabled = true;
    else h.prior.remove();
    key("keydown", "Escape");
    expect(h.fallback).toHaveBeenCalledOnce();
  },
);
it("routes clipboard edits to the query and rejects late pastes after dismissal", async () => {
  const h = setup();
  h.open();
  await flush();
  expect(h.palette.clipboardAction("paste")).toBe(true);
  await flush();
  expect(query().value).toBe("Ampliar");
  h.palette.clipboardAction("select-all");
  h.palette.clipboardAction("copy");
  expect(h.clipboard.writeText).toHaveBeenCalledWith("Ampliar");
  let finish!: (text: string) => void;
  h.clipboard.readText.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  h.palette.clipboardAction("paste");
  key("keydown", "Escape");
  finish("late");
  await flush();
  h.open();
  await flush();
  expect(query().value).toBe("");
});
