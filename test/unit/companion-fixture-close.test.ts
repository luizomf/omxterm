import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

// Execute the fixtures' actual lifecycle oracles without importing Electron,
// launching a window, or confusing controlled predicates with native evidence.
const fixtures = [
  [
    "files-production.mjs",
    "  async function closeFiles(",
    "  // These DOM-driven",
    "closeFiles(view, action)",
  ],
  [
    "files-packaged.cjs",
    "  async function closeFiles(",
    "  async function apply(",
    "closeFiles(view, action)",
  ],
  [
    "ssh-packaged.cjs",
    "  async function closeSsh(",
    '\n  await panel(view, true, "child");',
    "closeSsh(action, afterClose)",
  ],
  [
    "snippets-scenario.cjs",
    "    async function closeAndReopen(",
    "    await closeAndReopen(",
    "closeAndReopen(action)",
  ],
] as const;

for (const [file, start, end, call] of fixtures) {
  it.each([
    "settled",
    "no-destroy-event",
    "not-destroyed",
    "still-attached",
    "panel-visible",
    "wrong-focus",
    "same-view",
    "same-id",
    "draft",
    "duplicate-view",
    "backend-replaced",
    "extra-backend",
    "backend-closed",
    "backend-exited",
  ])(
    `${file} Close oracle rejects incomplete retirement/reopen: %s`,
    async (fault) => {
      const source = await readFile(`test/fixtures/${file}`, "utf8");
      const from = source.indexOf(start);
      const to = source.indexOf(end, from);
      expect(from).toBeGreaterThan(0);
      expect(to).toBeGreaterThan(from);
      let destroyed = false;
      let onDestroyed = () => {};
      const old = {
        id: 1,
        once: (_event: string, listener: () => void) => {
          onDestroyed = listener;
        },
        executeJavaScript: async () => true,
        isDestroyed: () => destroyed,
      };
      const fresh = {
        id: fault === "same-id" ? 1 : 2,
        executeJavaScript: async (script: string) =>
          script.includes("=== 'discard-on-close'")
            ? fault === "draft"
            : fault !== "draft",
        isDestroyed: () => false,
        isFocused: () => true,
        on: () => {},
      };
      const native = { webContents: old, getVisible: () => true };
      const freshNative = { webContents: fresh, getVisible: () => true };
      const window = { contentView: { children: [native] as unknown[] } };
      let hosted: unknown[] = [old];
      const backend = { closed: false, exit: null as unknown };
      const children = [backend];
      const reveal = vi.fn(async () => {
        const next = fault === "same-view" ? old : fresh;
        hosted = fault === "duplicate-view" ? [next, {}] : [next];
        window.contentView.children = [
          fault === "same-view" ? native : freshNative,
        ];
        if (fault === "backend-replaced") children[0] = { ...backend };
        if (fault === "extra-backend") children.push({ ...backend });
        return next;
      });
      const afterClose = vi.fn(async () => {
        expect(hosted).toEqual([]);
        expect(reveal).not.toHaveBeenCalled();
      });
      const action = async () => {
        destroyed = fault !== "not-destroyed";
        if (fault !== "no-destroy-event") onDestroyed();
        if (fault !== "still-attached") window.contentView.children = [];
        hosted = [];
        if (fault === "backend-closed") backend.closed = true;
        if (fault === "backend-exited")
          backend.exit = { code: 0, signal: null };
      };
      let panelListener: (() => void) | undefined;
      const unsubscribe = vi.fn(() => {
        panelListener = undefined;
      });
      const subscribe = vi.fn((listener: () => void) => {
        panelListener = listener;
        return unsubscribe;
      });
      const rendererWindow = {
        __filesPanelToggled: false,
        omxterm: { terminal: { onAuxiliaryPanelToggle: subscribe } },
      };
      const environment = {
        assert,
        window,
        core: { isFocused: () => fault !== "wrong-focus" },
        hosted: () => hosted,
        children,
        until: async (check: () => unknown) => {
          assert.equal(await check(), true);
        },
        js: async (script: string) => {
          if (
            script.includes("__filesPanelToggled") ||
            script.includes("__removeFilesPanelToggle")
          ) {
            // executeJavaScript transports the evaluated completion value.
            // Execute the extracted subscription/read/cleanup expressions,
            // then model structured clone instead of returning a fake ACK.
            const completion: unknown = runInNewContext(script, {
              window: rendererWindow,
            });
            return structuredClone(completion);
          }
          return !(
            fault === "panel-visible" && script.includes(".auxiliary-panel")
          );
        },
        sameTerminal: async () => {},
        shellStat: () => ({ start: 1 }),
        identity: { start: 1 },
        openFiles: async () => {
          const next = await reveal();
          // openFiles' existing readiness/panel oracle rejects duplicates.
          assert.equal(hosted.length, 1);
          return next;
        },
        menu: async (label: string) => {
          if (label === "Toggle Auxiliary Panel") panelListener?.();
          else await reveal();
        },
        panel: async (contents: unknown) => {
          assert.equal(hosted.length, 1);
          assert.equal(hosted[0], contents);
        },
        checks: [],
        ptys: [{}],
        session: { exited: false },
        visibleCanvas: "canvas",
        readFile: async () => "catalog",
        catalogPath: "catalog",
        originalCatalog: "catalog",
        observeInput: () => () => {},
      };
      const run = new Function(
        "environment",
        "initialView",
        "initialNative",
        "action",
        "afterClose",
        `
      const { ${Object.keys(environment).join(", ")} } = environment;
      let view = initialView, native = initialNative;
      ${source.slice(from, to)}
      return ${call};
    `,
      ) as (...args: unknown[]) => Promise<unknown>;
      const result = run(environment, old, native, action, afterClose);
      if (fault === "settled") {
        await result;
        expect(reveal).toHaveBeenCalledOnce();
        if (file === "files-production.mjs") {
          expect(subscribe).toHaveBeenCalledOnce();
          expect(rendererWindow.__filesPanelToggled).toBe(true);
          expect(unsubscribe).toHaveBeenCalledOnce();
          expect(panelListener).toBeUndefined();
        }
        if (file === "ssh-packaged.cjs")
          expect(afterClose).toHaveBeenCalledOnce();
      } else await expect(result).rejects.toThrow();
    },
  );

  it(`${file} distinguishes the explicit controls and independent action`, async () => {
    const source = await readFile(`test/fixtures/${file}`, "utf8");
    expect(source).not.toContain(".auxiliary-header button");
    expect(source).toContain(".auxiliary-hide");
    expect(source).toContain(".auxiliary-close");
    expect(source).toContain('"Toggle Auxiliary Panel"');
  });
}

it.each([
  "settled",
  "old-output-pending",
  "no-new-output",
  "no-input",
  "duplicate-client",
  "exited",
  "replaced-surface",
])(
  "SSH live control oracle requires fresh input and rendered output: %s",
  async (fault) => {
    const source = await readFile("test/fixtures/ssh-packaged.cjs", "utf8");
    const start = source.indexOf("  async function liveAckCount()");
    const end = source.indexOf("  const retainedLiveView", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    let input = "X",
      copied = "",
      acks = fault === "old-output-pending" ? 0 : 1;
    let invocations = "original-clients";
    const insertText = vi.fn(async (text: string) => {
      if (fault !== "no-input") input += text;
      if (fault !== "no-new-output") acks++;
      if (fault === "duplicate-client") invocations += "duplicate";
    });
    const environment = {
      assert,
      live: {},
      alive: () => fault !== "exited",
      js: async () => fault !== "replaced-surface",
      core: { insertText },
      clientsBeforeClose: "original-clients",
      file: (name: string) => name,
      fs: {
        readFileSync: (name: string) =>
          name === "ssh-live-input.bin" ? input : invocations,
      },
      clipboard: {
        clear: () => {
          copied = "";
        },
        readText: () => copied,
      },
      menu: (label: string) => {
        if (label === "Copy")
          copied =
            "SYNTHETIC-SSH-live-OUTPUT" + "SYNTHETIC-INPUT-ACK".repeat(acks);
      },
      until: async (check: () => unknown) => {
        assert.equal(await check(), true);
      },
    };
    const run = new Function(
      "environment",
      `const { ${Object.keys(environment).join(", ")} } = environment; ${source.slice(start, end)} return liveControl('H', 'XH');`,
    ) as (environment: unknown) => Promise<void>;
    if (fault === "settled")
      await expect(run(environment)).resolves.toBeUndefined();
    else await expect(run(environment)).rejects.toThrow();
    if (fault === "old-output-pending")
      expect(insertText).not.toHaveBeenCalled();
  },
);
