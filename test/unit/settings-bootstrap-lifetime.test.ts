import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { runScripts: "outside-only" },
  ) => { window: Window & typeof globalThis };
};
import { expect, it, vi } from "vitest";
import { base, deferred } from "../fixtures/settings-dialog-dom";
import { clipboardOptions } from "../fixtures/terminal-ipc-harness";

const compositionPath = /[\\/]src[\\/]renderer[\\/]start-terminal-window\.ts$/;

it.each([false, true])(
  "keeps the actual bootstrap's graphical survivor after first-mount rejection (dispose control=%s)",
  async (oldDispose) => {
    for (const file of [
      "C:/synthetic/src/renderer/start-terminal-window.ts",
      "C:\\synthetic\\src\\renderer\\start-terminal-window.ts",
    ])
      expect(compositionPath.test(file)).toBe(true);
    expect(compositionPath.test("C:/synthetic/src/renderer/index.ts")).toBe(
      false,
    );
    const hits = { gpu: 0, disposal: 0 };
    const bundle = await build({
      entryPoints: ["src/renderer/index.ts"],
      bundle: true,
      write: false,
      outdir: "/synthetic/settings-bootstrap",
      format: "iife",
      platform: "browser",
      loader: { ".ttf": "binary" },
      plugins: [
        {
          name: "headless-gpu-seam",
          setup(builder) {
            builder.onResolve(
              { filter: /restty-terminal-surface$/ },
              (args) => {
                if (!compositionPath.test(args.importer)) return;
                hits.gpu += 1;
                return { path: "held-surface", namespace: "headless" };
              },
            );
            builder.onLoad({ filter: /.*/, namespace: "headless" }, () => ({
              loader: "js",
              contents:
                "export function mountResttyTerminalSurface() { return globalThis.heldSurface; }",
            }));
            if (oldDispose)
              builder.onLoad({ filter: compositionPath }, async (args) => {
                const source = await readFile(args.path, "utf8");
                expect(
                  source.split("void host.ready.catch(() => {});"),
                ).toHaveLength(2);
                hits.disposal += 1;
                return {
                  loader: "ts",
                  contents: source.replace(
                    "void host.ready.catch(() => {});",
                    "void host.ready.catch(() => host.dispose());",
                  ),
                };
              });
          },
        },
      ],
    });
    expect(hits).toEqual({ gpu: 1, disposal: oldDispose ? 1 : 0 });
    const dom = new JSDOM(
      '<nav id="tab-strip"></nav><main id="terminal-tabs"></main><aside id="snippets-sidebar" hidden></aside><div id="user-file-errors" hidden></div><div id="terminal-surface-failure" hidden></div>',
      { runScripts: "outside-only" },
    );
    const pending = deferred<never>();
    const remove = vi.fn();
    const subscribe = () => remove;
    let openSettings!: () => void;
    const empty = vi.fn();
    const snapshot = vi.fn(async () => base);
    const terminal = {
      configuration: async () => clipboardOptions().configuration,
      windowChrome() {},
      onWindowChrome: subscribe,
      onTitleBarToggle: subscribe,
      onConfigurationUpdate: subscribe,
      onFontZoom: subscribe,
      onClipboardAction: subscribe,
      onTabCommand: subscribe,
      onTabBarToggle: subscribe,
      onAuxiliaryPanelToggle: vi.fn(subscribe),
      onFind: subscribe,
      onTabTitle: subscribe,
      onLocalImageOpen: subscribe,
      onSnippetsToggle: subscribe,
      notifyTabSelection: vi.fn(),
      syncTabTitle: vi.fn(),
      notifyTabsEmpty: empty,
      fontData: vi.fn(),
      snippets: vi.fn(async () => ({ snippets: [] })),
      loadLocalImage: vi.fn(async () => null),
    };
    Object.assign(dom.window, {
      heldSurface: pending.promise,
      TextEncoder,
      TextDecoder,
      Uint8Array: class extends Uint8Array {
        static fromBase64(value: string) {
          return new Uint8Array(Buffer.from(value, "base64"));
        }
      },
      omxterm: {
        terminal,
        settings: {
          snapshot,
          onOpen: (listener: () => void) => {
            openSettings = listener;
            return remove;
          },
        },
        about: { onOpen: subscribe },
      },
    });
    try {
      dom.window.eval(
        bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text,
      );
      await vi.waitFor(() => expect(openSettings).toBeTypeOf("function"));
      expect(terminal.onAuxiliaryPanelToggle).toHaveBeenCalledOnce();
      openSettings();
      await vi.waitFor(() =>
        expect(dom.window.document.querySelector("textarea")).not.toBeNull(),
      );
      const editor = dom.window.document.querySelector("textarea")!;
      editor.value = "synthetic retained draft";
      pending.reject(new Error("Synthetic pre-start rendering failure"));
      await vi.waitFor(() =>
        expect(dom.window.document.querySelector(".terminal-tab")).toBeNull(),
      );
      // Flush the bootstrap catch after pane cleanup; readiness is still rejected.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(editor.isConnected).toBe(!oldDispose);
      expect(empty).not.toHaveBeenCalled();
      if (!oldDispose) {
        expect(editor.value).toBe("synthetic retained draft");
        expect(remove).not.toHaveBeenCalled();
        openSettings();
        expect(snapshot).toHaveBeenCalledOnce();
      } else expect(remove).toHaveBeenCalled();
    } finally {
      dom.window.dispatchEvent(new dom.window.Event("pagehide"));
      dom.window.close();
    }
  },
);
