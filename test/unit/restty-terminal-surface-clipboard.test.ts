// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PatchedResttyConfig,
  PatchedResttyPane,
} from "../../src/terminal-surface/restty-runtime-contract";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

const harness = vi.hoisted(() => {
  class FakeRestty {
    static instances: FakeRestty[] = [];
    readonly canvas = document.createElement("canvas");
    readonly destroy = vi.fn();
    readonly getSelectionText = vi.fn(() => this.selection);
    readonly selectAll = vi.fn(() => true);
    readonly getBufferText = vi.fn(() => "scrollback\nscreen");
    readonly isSearchOpen = vi.fn(() => false);
    readonly setSearchUiStyleOptions = vi.fn();
    selection = "";
    bracketedPaste = false;
    readonly pane = {
      container: document.createElement("div"),
      runtime: {
        events: { subscribe: () => () => undefined },
        lifecycle: { init: async () => undefined, state: () => "ready" },
        render: { getBackend: () => "webgl2", refresh: vi.fn() },
        io: {
          connectPty: () => {
            const transport = this.services().ptyTransport;
            void transport.connect({ url: "", callbacks: { onData: vi.fn() } });
          },
        },
        interaction: {
          focus: vi.fn(),
          getSelectionText: this.getSelectionText,
          getBufferText: this.getBufferText,
          getVisibleLinkAtClientPoint: vi.fn(() => ({
            id: "visible-1",
            url: "https://example.test",
            cells: [1, 2],
          })),
          setVisibleLinkHover: vi.fn(),
          selectAll: this.selectAll,
          scrollToBottom: vi.fn(),
          updateSize: vi.fn(),
        },
        terminal: {
          applyTheme: vi.fn(),
          isBracketedPasteEnabled: () => this.bracketedPaste,
          setFontSize: vi.fn(),
          setLigatures: vi.fn(),
          setOptionKeyMode: vi.fn(),
          setScrollbackLines: vi.fn(),
        },
      },
    } satisfies PatchedResttyPane;

    constructor(readonly options: PatchedResttyConfig) {
      this.pane.container.append(this.canvas);
      options.root.append(this.pane.container);
      FakeRestty.instances.push(this);
    }

    getActivePane() {
      return this.pane;
    }

    services() {
      return this.options.services;
    }
  }
  return { FakeRestty };
});

vi.mock("restty", () => ({ Restty: harness.FakeRestty }));
vi.mock("../../assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf", () => ({
  default: new Uint8Array([0, 1, 2, 3]),
}));

function createHarness() {
  let handlers: TerminalSessionHandlers | undefined;
  const adapter = {
    start: vi.fn(async (next: TerminalSessionHandlers) => {
      handlers = next;
    }),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  };
  const clipboard = {
    writeText: vi.fn(async () => undefined),
    readText: vi.fn(async () => ""),
    confirmPaste: vi.fn(async () => false),
    requestContextMenu: vi.fn(),
  };
  return { adapter, clipboard, handlers: () => handlers! };
}

async function mount(
  harnessOptions = createHarness(),
  options: Record<string, unknown> = {},
) {
  const { mountResttyTerminalSurface } =
    await import("../../src/terminal-surface/restty-terminal-surface");
  const container = document.createElement("main");
  const surface = await mountResttyTerminalSurface(
    container,
    harnessOptions.adapter,
    { clipboard: harnessOptions.clipboard, ...options },
  );
  return {
    ...harnessOptions,
    container,
    surface,
    restty: harness.FakeRestty.instances.at(-1)!,
  };
}

describe("Restty clipboard and Protected Paste", () => {
  beforeEach(() => {
    harness.FakeRestty.instances.length = 0;
  });

  it("reveals accepted input but not focus, replies, empty input or rejected paste", async () => {
    const value = await mount();
    const reveal = value.restty.pane.runtime.interaction.scrollToBottom;
    const services = value.restty.services();
    services.beforeInput({ text: "\u001b[I", source: "program" });
    services.beforeInput({ text: "", source: "key" });
    services.ptyTransport.sendInput("\u001b[1;1R");
    value.surface.focus();
    value.clipboard.confirmPaste.mockResolvedValue(false);
    await value.surface.inject("one\ntwo");
    expect(reveal).not.toHaveBeenCalled();
    services.beforeInput({ text: "x", source: "key" });
    expect(reveal).toHaveBeenCalledOnce();
    await value.surface.inject("accepted");
    expect(reveal).toHaveBeenCalledTimes(2);
    value.surface.dispose();
  });

  it("clears modified-hover decoration on output, geometry change, and disposal", async () => {
    const value = await mount(createHarness(), { onExternalLink: vi.fn() });
    const hover = value.restty.pane.runtime.interaction.setVisibleLinkHover;
    value.restty.canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientX: 10,
        clientY: 10,
        ctrlKey: true,
      }),
    );
    expect(hover).toHaveBeenLastCalledWith([1, 2]);

    value.handlers().onOutput("changed");
    expect(hover).toHaveBeenLastCalledWith(null);
    value.restty.canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientX: 10,
        clientY: 10,
        ctrlKey: true,
      }),
    );
    value.surface.zoom("in");
    expect(hover).toHaveBeenLastCalledWith(null);

    value.surface.dispose();
    expect(hover).toHaveBeenLastCalledWith(null);
  });

  it("copies only explicit nonempty selection and routes selection/context actions", async () => {
    const value = await mount();
    await value.surface.copy();
    value.restty.selection = "selected text";
    await value.surface.copy();
    value.surface.selectAll();
    const menu = new MouseEvent("contextmenu", { cancelable: true });
    value.container.dispatchEvent(menu);

    expect(value.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(
      "selected text",
    );
    expect(value.restty.selectAll).toHaveBeenCalledOnce();
    expect(menu.defaultPrevented).toBe(true);
    expect(value.clipboard.requestContextMenu).toHaveBeenCalledExactlyOnceWith({
      hasSelection: true,
    });
    value.restty.selection = "";
    value.container.dispatchEvent(
      new MouseEvent("contextmenu", { cancelable: true }),
    );
    expect(value.clipboard.requestContextMenu).toHaveBeenLastCalledWith({
      hasSelection: false,
    });
    value.surface.dispose();
  });

  it("reads export text without selecting or clearing anything", async () => {
    const value = await mount();
    value.restty.selection = "selected 日本語";

    expect(value.surface.exportText("selection")).toBe("selected 日本語");
    expect(value.surface.exportText("content")).toBe("scrollback\nscreen");
    expect(value.restty.selectAll).not.toHaveBeenCalled();
    expect(value.restty.getSelectionText).toHaveBeenCalled();
    expect(value.restty.selection).toBe("selected 日本語");

    value.surface.dispose();
    expect(value.surface.exportText("content")).toBe("");
  });

  it("diverts native paste asynchronously while ordinary keyboard input stays direct", async () => {
    let decide: ((approved: boolean) => void) | undefined;
    const value = createHarness();
    value.clipboard.confirmPaste.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          decide = resolve;
        }),
    );
    const mounted = await mount(value);
    const services = mounted.restty.services();

    expect(
      services.beforeInput({ text: "one\ntwo", source: "paste" }),
    ).toBeNull();
    await vi.waitFor(() =>
      expect(mounted.clipboard.confirmPaste).toHaveBeenCalledOnce(),
    );
    expect(services.beforeInput({ text: "x", source: "key" })).toBe("x");
    services.ptyTransport.sendInput("x");
    expect(mounted.adapter.write.mock.calls.flat()).toEqual(["x"]);

    mounted.restty.bracketedPaste = true;
    decide!(true);
    await vi.waitFor(() =>
      expect(mounted.adapter.write.mock.calls.flat().join("")).toBe(
        "x\u001b[200~one\ntwo\u001b[201~",
      ),
    );
    mounted.surface.dispose();
  });

  it("preserves paste request order when clipboard reads resolve out of order", async () => {
    const reads: Array<(text: string) => void> = [];
    const value = createHarness();
    value.clipboard.readText.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          reads.push(resolve);
        }),
    );
    const mounted = await mount(value);

    const first = mounted.surface.paste();
    const second = mounted.surface.paste();
    await vi.waitFor(() => expect(reads).toHaveLength(2));
    reads[1]!("second");
    expect(mounted.adapter.write).not.toHaveBeenCalled();
    reads[0]!("first");

    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(mounted.adapter.write.mock.calls.flat().join("")).toBe(
      "firstsecond",
    );
    mounted.surface.dispose();
  });

  it("serializes two pastes, cancellation, and current-mode decisions", async () => {
    const decisions: Array<(approved: boolean) => void> = [];
    const value = createHarness();
    value.clipboard.confirmPaste.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          decisions.push(resolve);
        }),
    );
    const mounted = await mount(value);
    const beforeInput = mounted.restty.services().beforeInput;

    beforeInput({ text: "cancelled\n", source: "paste" });
    beforeInput({ text: "second\n", source: "paste" });
    await vi.waitFor(() => expect(decisions).toHaveLength(1));
    decisions.shift()!(false);
    await vi.waitFor(() => expect(decisions).toHaveLength(1));
    mounted.restty.bracketedPaste = true;
    decisions.shift()!(true);

    await vi.waitFor(() =>
      expect(mounted.adapter.write.mock.calls.flat().join("")).toBe(
        "\u001b[200~second\n\u001b[201~",
      ),
    );
    mounted.surface.dispose();
  });

  it("drops rejection/disposal work and stops chunks before snippet Enter", async () => {
    let decide: ((approved: boolean) => void) | undefined;
    const onClipboardError = vi.fn();
    const value = createHarness();
    value.clipboard.confirmPaste
      .mockRejectedValueOnce(new Error("dialog failed"))
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            decide = resolve;
          }),
      );
    const mounted = await mount(value, { onClipboardError });
    const beforeInput = mounted.restty.services().beforeInput;

    beforeInput({ text: "rejected\n", source: "paste" });
    await vi.waitFor(() => expect(onClipboardError).toHaveBeenCalledOnce());
    beforeInput({ text: "disposed\n", source: "paste" });
    await vi.waitFor(() => expect(decide).toBeTypeOf("function"));
    mounted.surface.dispose();
    decide!(true);
    await Promise.resolve();
    expect(mounted.adapter.write).not.toHaveBeenCalled();

    const second = await mount();
    second.restty.bracketedPaste = true;
    second.adapter.write.mockImplementationOnce(() => second.surface.dispose());
    await second.surface.inject(`first\n${"🙂".repeat(40_000)}`, {
      submit: true,
    });
    expect(second.adapter.write).toHaveBeenCalledOnce();
    expect(second.adapter.write.mock.calls.flat().join("")).not.toContain("\r");
  });

  it("preserves embedded bracket terminators and controls unchanged", async () => {
    const mounted = await mount();
    mounted.restty.bracketedPaste = true;
    const text = "before\u001b[201~inside\u0000\u0003after";

    await mounted.surface.inject(text);

    expect(mounted.adapter.write.mock.calls.flat().join("")).toBe(
      `\u001b[200~${text}\u001b[201~`,
    );
    mounted.surface.dispose();
  });

  it("submits after bracketed delivery and accepts only valid parsed OSC writes", async () => {
    const mounted = await mount();
    mounted.restty.bracketedPaste = true;
    await mounted.surface.inject("one\ntwo", { submit: true });
    mounted.restty.services().onOsc(52, "c;aGVsbG8=");
    mounted.restty.services().onOsc(52, "c;?");
    mounted.restty.services().onOsc(8, "c;aGVsbG8=");
    await vi.waitFor(() =>
      expect(mounted.clipboard.writeText).toHaveBeenCalledOnce(),
    );

    expect(mounted.adapter.write.mock.calls.flat().join("")).toBe(
      "\u001b[200~one\ntwo\u001b[201~\r",
    );
    expect(mounted.clipboard.writeText).toHaveBeenCalledWith("hello");
    expect(mounted.clipboard.readText).not.toHaveBeenCalled();
    mounted.surface.dispose();
  });
});
