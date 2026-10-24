// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PatchedResttyConfig } from "../../src/terminal-surface/restty-runtime-contract";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import type { TerminalFontInputLease } from "../../src/terminal-surface/terminal-surface";

const instances = vi.hoisted(
  () => [] as { getActivePane(): { container: HTMLElement } | null }[],
);
vi.mock(
  "../../src/terminal-surface/restty-runtime-contract",
  async (original) => {
    const runtime =
      await original<
        typeof import("../../src/terminal-surface/restty-runtime-contract")
      >();
    return {
      ...runtime,
      PatchedRestty: class extends runtime.PatchedRestty {
        constructor(options: PatchedResttyConfig) {
          // Use the installed production constructor and its actual pane/IME focus
          // manager. GPU/core initialization, rendering and transport startup are
          // replaced; the real interaction focus implementation is left intact.
          super(options);
          const pane = this.getActivePane()!;
          vi.spyOn(pane.runtime.lifecycle, "init").mockResolvedValue();
          vi.spyOn(pane.runtime.io, "connectPty").mockImplementation(() => {});
          vi.spyOn(pane.runtime.lifecycle, "state").mockReturnValue("ready");
          vi.spyOn(pane.runtime.render, "getBackend").mockReturnValue("webgl2");
          vi.spyOn(pane.runtime.render, "refresh").mockImplementation(() => {});
          vi.spyOn(pane.runtime.interaction, "updateSize").mockImplementation(
            () => {},
          );
          instances.push(this);
        }
      },
    };
  },
);
vi.mock("../../assets/fonts/FiraCodeNerdFontMono-Regular.ttf", () => ({
  default: new Uint8Array([1]),
}));
vi.mock("../../assets/fonts/FiraCodeNerdFontMono-Bold.ttf", () => ({
  default: new Uint8Array([2]),
}));
vi.mock("../../assets/fonts/DejaVuSansMono.ttf", () => ({
  default: new Uint8Array([3]),
}));
vi.mock("../../assets/fonts/DejaVuSansMono-Bold.ttf", () => ({
  default: new Uint8Array([4]),
}));
vi.mock("../../assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf", () => ({
  default: new Uint8Array([5]),
}));
const cleanups: Array<() => void> = [];
beforeEach(() => {
  instances.length = 0;
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function adapter() {
  return {
    start: vi.fn(async () => {}),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    sessionId: () => "fixture",
  };
}
async function setup() {
  const content = document.createElement("div"),
    root = document.createElement("aside"),
    tabStrip = document.createElement("nav"),
    tabsContainer = document.createElement("div");
  content.append(tabsContainer, root);
  document.body.append(tabStrip, content);
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  let toggle!: () => void, command!: (command: TerminalTabCommand) => void;
  let releaseFonts!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  let mounts = 0,
    completed = 0;
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      createAdapter: adapter,
      mount: async (container, transport, options) => {
        const pending = ++mounts === 2;
        const surface = await mountResttyTerminalSurface(container, transport, {
          ...options,
          acquireFontInputs: async (): Promise<TerminalFontInputLease> => {
            if (pending) await gate;
            return { fonts: [], release() {} };
          },
        });
        completed += 1;
        return surface;
      },
      subscribeToTabCommands(listener) {
        command = listener;
        return () => {};
      },
      snippets: {
        element: root,
        load: async () => ({ snippets: [] }),
        subscribeToToggle(listener) {
          toggle = listener;
          return () => {};
        },
      },
    },
  );
  cleanups.push(host.dispose);
  await host.ready;
  return { root, command, toggle, releaseFonts, mounted: () => completed };
}

it.each(["search", "separator"])(
  "preserves %s focus when delayed fonts construct a real later Restty pane",
  async (control) => {
    const f = await setup();
    f.command({ action: "new" });
    f.toggle();
    const target =
      control === "search"
        ? f.root.querySelector("input")!
        : document.querySelector<HTMLElement>(".auxiliary-separator")!;
    target.focus();
    expect(instances).toHaveLength(1);
    f.releaseFonts();
    await vi.waitFor(() => expect(f.mounted()).toBe(2));
    expect(instances).toHaveLength(2);
    expect(document.activeElement).toBe(target);
    // Deliberate selection remains eligible even while the panel is open.
    f.command({ action: "select", position: 1 });
    expect(
      instances[0]!.getActivePane()!.container.contains(document.activeElement),
    ).toBe(true);
  },
);

it("keeps deliberate New Tab focus if no control takes focus during its mount", async () => {
  const f = await setup();
  f.toggle();
  f.command({ action: "new" });
  f.releaseFonts();
  await vi.waitFor(() => expect(f.mounted()).toBe(2));
  expect(
    instances[1]!.getActivePane()!.container.contains(document.activeElement),
  ).toBe(true);
});

it("does not restore a mount's old focus intent after moving away and back to the same panel field", async () => {
  const f = await setup();
  f.toggle();
  const input = f.root.querySelector("input")!;
  f.command({ action: "new" });
  document.querySelector<HTMLElement>(".auxiliary-separator")!.focus();
  input.focus();
  f.releaseFonts();
  await vi.waitFor(() => expect(f.mounted()).toBe(2));
  expect(document.activeElement).toBe(input);
});

it.each([undefined, false])(
  "preserves standalone initial focus=%s and deliberate Surface focus",
  async (focus) => {
    const outside = document.createElement("input"),
      container = document.createElement("main");
    document.body.append(outside, container);
    outside.focus();
    const surface = await mountResttyTerminalSurface(container, adapter(), {
      ...(focus === undefined ? {} : { focus }),
      acquireFontInputs: async () => ({ fonts: [], release() {} }),
    });
    cleanups.push(surface.dispose);
    expect(container.contains(document.activeElement)).toBe(
      focus === undefined,
    );
    surface.focus();
    expect(container.contains(document.activeElement)).toBe(true);
  },
);
