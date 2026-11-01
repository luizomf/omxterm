import { createRequire } from "node:module";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import type * as WindowHost from "../../src/renderer/terminal-window-host";
import { resttyImageGeometryPanelPlugin } from "../fixtures/restty-host-build";
import { resttyLinkReadinessProbe } from "../fixtures/restty-link-readiness-probe";
import { resttyFontMutationProbe } from "../fixtures/restty-font-mutation-probe";

// Keep esbuild in Node's realm. JSDOM exercises panel ownership, not layout,
// PTY geometry, Restty, or image pixels.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { pretendToBeVisual: boolean },
  ) => { window: typeof window & { close(): void } };
};
const dom = new JSDOM("<body></body>", { pretendToBeVisual: true });
let hostModule: typeof WindowHost;
let uninstrumentedHost: typeof WindowHost;
const disposals: Array<() => void> = [];

async function bundleHost(withFixture: boolean): Promise<typeof WindowHost> {
  const result = await build({
    entryPoints: ["src/renderer/terminal-window-host.ts"],
    bundle: true,
    platform: "browser",
    // The stub Surface never loads fonts; native font bytes are not this test's seam.
    loader: { ".ttf": "empty" },
    format: "cjs",
    write: false,
    logLevel: "silent",
    plugins: [
      ...(withFixture ? [resttyImageGeometryPanelPlugin] : []),
      resttyLinkReadinessProbe,
    ],
  });
  const module = { exports: {} };
  const evaluate = new Function(
    "module",
    "exports",
    `${result.outputFiles[0]!.text}\n//# sourceURL=image-panel-headless-host.cjs`,
  ) as (module: { exports: object }, exports: object) => void;
  evaluate(module, module.exports);
  return module.exports as typeof WindowHost;
}

beforeAll(async () => {
  for (const key of [
    "window",
    "document",
    "Node",
    "HTMLElement",
    "AbortController",
    "AbortSignal",
  ] as const)
    vi.stubGlobal(key, key === "window" ? dom.window : dom.window[key]);
  [hostModule, uninstrumentedHost] = await Promise.all([
    bundleHost(true),
    bundleHost(false),
  ]);
});

afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  delete (window as FixtureWindow).__resttyImageGeometryPanel;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

type FixtureWindow = Window & {
  __resttyImageGeometryPanel?: { show(): void; close(): void };
};

async function mountHost(instrumented: boolean, builtInSnippets: boolean) {
  const content = document.createElement("div");
  const root = document.createElement("aside");
  const tabsContainer = document.createElement("main");
  const tabStrip = document.createElement("nav");
  root.id = "snippets-sidebar";
  content.append(tabsContainer, root);
  document.body.append(tabStrip, content);
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  let toggleSnippets = () => {};
  let togglePanel = () => {};
  const loadSnippets = vi.fn(async () => ({ snippets: [] }));
  const surface = {
    geometry: () => ({
      cellWidth: 10,
      cellHeight: 20,
      insetWidth: 0,
      insetHeight: 0,
    }),
    dispose: vi.fn(),
    focus: vi.fn(),
    applyTheme: vi.fn(),
    applyConfiguration: vi.fn(),
    inject: vi.fn(async () => {}),
    zoom: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    find: vi.fn(),
  };
  const adapter = {
    sessionId: () => "s1",
    start: async () => {},
    write() {},
    resize() {},
    close() {},
  };
  const mount = (instrumented ? hostModule : uninstrumentedHost)
    .mountTerminalWindowPage;
  type Options = Parameters<typeof mount>[1];
  const host = mount(
    { tabStrip, tabsContainer, auxiliaryPanel: root },
    {
      page: window,
      createAdapter: () => adapter as ReturnType<Options["createAdapter"]>,
      subscribeToAuxiliaryPanelToggle(listener) {
        togglePanel = listener;
        return () => {};
      },
      mount: async () =>
        surface as Awaited<ReturnType<NonNullable<Options["mount"]>>>,
      ...(builtInSnippets
        ? {
            snippets: {
              load: loadSnippets,
              subscribeToToggle(listener: () => void) {
                toggleSnippets = listener;
                return () => {};
              },
            },
          }
        : {}),
    },
  );
  disposals.push(host.dispose);
  await host.ready;
  return {
    root,
    host,
    loadSnippets,
    toggleSnippets: () => toggleSnippets(),
    togglePanel: () => togglePanel(),
  };
}

it.each([false, true])(
  "uses the actual host's shared panel without activating Snippets (built-in: %s)",
  async (builtIn) => {
    const { root, host, loadSnippets, toggleSnippets, togglePanel } =
      await mountHost(true, builtIn);
    const fixture = (window as FixtureWindow).__resttyImageGeometryPanel!;
    expect(fixture).toBeDefined();
    expect(root.hidden).toBe(true);
    expect(document.querySelectorAll(".auxiliary-panel")).toHaveLength(1);
    fixture.show();
    expect(root.hidden).toBe(false);
    expect(root.style.width).toBe("280px");
    expect(root.querySelector("h2")?.textContent).toBe(
      "Image geometry fixture",
    );
    expect(
      root.querySelector(
        ".auxiliary-body > [data-restty-image-geometry-fixture]",
      ),
    ).not.toBeNull();
    expect(loadSnippets).not.toHaveBeenCalled();
    fixture.close();
    expect(root.hidden).toBe(true);
    expect(
      root.querySelector("[data-restty-image-geometry-fixture]"),
    ).toBeNull();
    expect(root.querySelector("input[type=search]")).toBeNull();
    togglePanel();
    expect(root.hidden).toBe(true);
    if (builtIn) {
      toggleSnippets();
      await Promise.resolve();
      expect(root.hidden).toBe(false);
      expect(root.querySelector("h2")?.textContent).toBe("Snippets");
      expect(loadSnippets).toHaveBeenCalledOnce();
      fixture.close(); // It must not dismiss another selected view.
      expect(root.hidden).toBe(false);
    }
    host.dispose();
    expect(
      (window as FixtureWindow).__resttyImageGeometryPanel,
    ).toBeUndefined();
    expect(document.querySelector(".auxiliary-separator")).toBeNull();
  },
);

it("does not expose the fixture when the actual host is bundled without its plugin", async () => {
  const { root } = await mountHost(false, false);
  expect((window as FixtureWindow).__resttyImageGeometryPanel).toBeUndefined();
  expect(root.hidden).toBe(true);
});

it("composes the panel fixture into the real host renderer bundle alongside its probes", async () => {
  const result = await build({
    entryPoints: ["src/renderer/index.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    loader: { ".ttf": "binary" },
    outfile: ".scratch/restty-image-panel-bundle/index.js",
    write: false,
    metafile: true,
    logLevel: "silent",
    plugins: [
      resttyImageGeometryPanelPlugin,
      resttyLinkReadinessProbe,
      resttyFontMutationProbe,
    ],
  });
  expect(
    result.metafile.inputs["src/renderer/terminal-window-host.ts"]!.imports,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: "test/fixtures/restty-host-image-panel.ts",
      }),
    ]),
  );
});
