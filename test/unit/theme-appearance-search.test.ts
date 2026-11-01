import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { InstalledPackages } from "../../src/installed-packages/installed-packages";
import { createExtensionPackageTrust } from "../../src/main/extension-package-trust";
import { createSnippetsView } from "../../src/renderer/snippets-sidebar";
import { loadTerminalSnippets } from "../../src/main/snippets";
import { prepareFixtureSnippets } from "../fixtures/fixture-snippets-build";
import { createThemeSearch } from "../fixtures/theme-appearance-search";
import { openThemeSearch } from "../fixtures/theme-appearance-exercise";
import type { BrowserWindow } from "electron";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { url: string; runScripts: "outside-only" },
  ) => {
    window: Window & typeof globalThis;
  };
};

function contents(window: Window & typeof globalThis) {
  let focused = false;
  return {
    focus() {
      focused = true;
    },
    isFocused() {
      return focused;
    },
    loseFocus() {
      focused = false;
    },
    async executeJavaScript(script: string) {
      return window.eval(script) as unknown;
    },
  };
}

it("retains the real installed Snippets page's search in its child document", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "omxterm-theme-search-"));
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://fixture.invalid/",
    runScripts: "outside-only",
  });
  try {
    const { archive, version } = await prepareFixtureSnippets(root);
    const runtime = { appVersion: version, apiVersion: "0.1.0" };
    const packages = await InstalledPackages.open({
      root: path.join(root, "store"),
      runtime,
      // This headless control does not claim native lease exclusion.
      leases: { tryAcquire: async () => ({ release: async () => {} }) },
    });
    const trust = createExtensionPackageTrust({
      packages,
      runtime,
      temporaryDirectory: root,
    });
    const owner = {};
    const preview = await trust.prepare(owner, archive);
    await trust.approve(owner, preview.token);
    const pin = await packages.openVersion("omxterm.snippets");
    try {
      const url = pathToFileURL(path.join(pin.directory, "backend.mjs")).href;
      const module = (await import(
        /* @vite-ignore */ url
      )) as typeof import("../../extensions/snippets/backend");
      const abort = new AbortController();
      const backend = module.activate(
        { signal: abort.signal },
        {
          environment: { XDG_CONFIG_HOME: path.join(root, "config") },
          homeDirectory: root,
        },
      );
      const unsubscribe = () => {};
      const requests = new Set<Promise<unknown>>();
      Object.assign(dom.window, {
        omxHostedContent: {
          request(value: unknown) {
            const request = backend.invoke(value, abort.signal);
            requests.add(request);
            void request.then(
              () => requests.delete(request),
              () => requests.delete(request),
            );
            return request;
          },
          onVisibility: (listener: (v: boolean) => void) => {
            listener(true);
            return unsubscribe;
          },
          onActivity: (listener: (v: boolean) => void) => {
            listener(true);
            return unsubscribe;
          },
          onLanguage: (listener: (v: string) => void) => {
            listener("en-US");
            return unsubscribe;
          },
          onFocusIntent: () => unsubscribe,
          onAppearance: () => unsubscribe,
        },
      });
      try {
        dom.window.eval(
          await readFile(path.join(pin.directory, "view.js"), "utf8"),
        );
        await vi.waitFor(() =>
          expect(
            dom.window.document.querySelectorAll(".snippet-activate"),
          ).toHaveLength(1),
        );
        const child = {
          ...contents(dom.window),
          isDestroyed: () => false,
          getURL: () => "omx-extension://fixture/index.html",
        };
        child.focus();
        let available = true;
        const nativeView = { webContents: child, getVisible: () => available };
        const core = new JSDOM(
          "<!doctype html><html><body><aside id='snippets-sidebar'></aside></body></html>",
          {
            url: "https://fixture.invalid/",
            runScripts: "outside-only",
          },
        );
        try {
          const window = {
            isDestroyed: () => false,
            contentView: { children: [nativeView] },
          } as unknown as BrowserWindow;
          const activated = vi.fn();
          const search = await openThemeSearch(
            window,
            async (script) => {
              expect(core.window.eval(script)).toBe(true);
            },
            { assertActivated: activated },
          );
          expect(activated).toHaveBeenCalledOnce();
          expect(core.window.document.querySelector("input")).toBeNull();
          await search.focus();
          await search.retain();
          expect(await search.focused()).toBe(true);
          expect(await search.retained()).toBe(true);
          child.loseFocus();
          expect(await search.focused()).toBe(false);
          await search.focus();
          expect(await search.retained()).toBe(true);
          available = false;
          expect(await search.focused()).toBe(false);
          expect(await search.retained()).toBe(false);
          await expect(search.focus()).rejects.toThrow(
            "Snippets search is unavailable",
          );
          available = true;
          const input =
            dom.window.document.querySelector("input[type=search]")!;
          input.replaceWith(input.cloneNode(true));
          expect(await search.retained()).toBe(false);
        } finally {
          core.window.close();
        }
      } finally {
        dom.window.dispatchEvent(new dom.window.Event("pagehide"));
        backend.deactivate();
        abort.abort();
        await Promise.allSettled([...requests]);
      }
    } finally {
      await pin.release();
    }
  } finally {
    dom.window.close();
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("keeps the built-in Snippets search in the core document", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "omxterm-theme-builtin-"));
  const dom = new JSDOM(
    "<!doctype html><html><body><aside id='snippets-sidebar'></aside></body></html>",
    {
      url: "https://fixture.invalid/",
      runScripts: "outside-only",
    },
  );
  let load: ReturnType<typeof loadTerminalSnippets> | undefined;
  const view = createSnippetsView(dom.window.document, {
    loadSnippets: () =>
      (load = loadTerminalSnippets({ environment: {}, homeDirectory: root })),
    inject() {},
    preview() {},
    isInteractive: () => true,
  });
  try {
    dom.window.document
      .querySelector("#snippets-sidebar")!
      .append(view.element);
    view.activate();
    const search = createThemeSearch(
      contents(dom.window),
      "#snippets-sidebar input",
      () => true,
    );
    await search.focus();
    await search.retain();
    expect(await search.focused()).toBe(true);
    expect(await search.retained()).toBe(true);
  } finally {
    view.dispose();
    await load?.catch(() => {});
    dom.window.close();
    await rm(root, { recursive: true, force: true });
  }
});
