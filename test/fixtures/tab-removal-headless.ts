import type { BuildOptions } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// The installed JSDOM package has no bundled declarations; type only this
// external DOM constructor port rather than adding a global module shim.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { url: string; runScripts: "outside-only" },
  ) => {
    window: Window & typeof globalThis;
  };
};
import { buildFixture } from "./tab-removal-build";
import { buildFixture as buildTitles } from "./startup-tab-titles-build";
import { createTabSelection } from "../../src/main/terminal-tab-selection";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import { initialTabRemovalReadiness } from "./tab-removal-initial-readiness";
import {
  createTabRemovalReadiness,
  TAB_REMOVAL_CONTROL_PREFIX,
} from "./tab-removal-readiness";

// Called by the test's external esbuild adapter. Recipes/plugins remain real;
// replace only rendering: the hold wrapper's underlying Surface, or the
// startup-title entry's Surface. The real recipe's importer hook runs first.
export function headlessSurface(options: BuildOptions): BuildOptions {
  return {
    ...options,
    plugins: [
      ...(options.plugins ?? []),
      {
        name: "headless-underlying-surface",
        setup(plugin) {
          plugin.onResolve({ filter: /restty-terminal-surface$/ }, (args) => {
            if (
              args.importer ===
                path.join(
                  process.cwd(),
                  "test/fixtures/tab-removal-surface-control.ts",
                ) ||
              args.importer ===
                path.join(
                  process.cwd(),
                  "src/renderer/start-terminal-window.ts",
                )
            )
              return { path: "surface", namespace: "headless-port" };
            return undefined;
          });
          plugin.onLoad(
            { filter: /^surface$/, namespace: "headless-port" },
            () => ({
              loader: "js",
              contents: `export async function mountResttyTerminalSurface(container, adapter) {
          await adapter.start({onOutput(){},onExit(){}});
          if(globalThis.surfacePort.beforeReturn) await globalThis.surfacePort.beforeReturn;
          return {geometry(){},focus(){},dispose(){adapter.close()},
            applyConfiguration(){globalThis.surfacePort.adoptions++},applyTheme(){},zoom(){},
            copy(){},paste(){},selectAll(){},find(){},inject(){}};
        }`,
            }),
          );
        },
      },
    ],
  };
}

export async function tabRemovalScene(
  control: string,
  scenario: "tab-removal" | "startup-titles" = "tab-removal",
) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-tab-ready-"));
  await (scenario === "tab-removal" ? buildFixture : buildTitles)(root);
  const dom = new JSDOM(await readFile("src/renderer/index.html", "utf8"), {
    url: `https://fixture.invalid/?tabRemovalControl=${control}`,
    runScripts: "outside-only",
  });
  const window = dom.window;
  const markers: string[] = [],
    phases: string[] = [];
  window.console.log = (line: string) => {
    markers.push(line);
  };
  Object.defineProperty(window.document, "hasFocus", { value: () => true });
  Object.defineProperty(window.Uint8Array, "fromBase64", {
    value: (text: string) => new window.Uint8Array(Buffer.from(text, "base64")),
  });
  let starts = 0,
    selected = "",
    adoptions = 0;
  let boundaryCalls = 0,
    boundarySettled = false;
  const sessions = new Map<string, { busy: boolean }>();
  const listeners = new Set<(command: TerminalTabCommand) => void>();
  const snapshots: unknown[] = [];
  const selection = createTabSelection({
    current: (id) => sessions.get(id),
    routed: (id) => sessions.get(id),
    isBusy: (session) => session.busy,
    hasBusySession: () => sessions.size > 0,
    reject: () => {
      throw new Error("Invalid fixture selection");
    },
    onSessionSelected(id) {
      selected = id ?? "";
    },
  });
  const subscribe = () => () => {};
  const bridge = {
    terminal: {
      configuration: async () => ({
        language: "en-US",
        transparency: 0,
        showTabBar: true,
        fontSize: 16,
        fontLineHeight: 1,
        fontLigatures: true,
        terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
        scrollbackLines: 10000,
        optionKeyMode: "none",
        nativeTitleInset: 0,
        terminalTheme: DEFAULT_TERMINAL_THEME,
        userFileErrors: [],
      }),
      async start() {
        const id = `s${++starts}`;
        sessions.set(id, { busy: true });
        return id;
      },
      input() {},
      resize() {},
      close(id: string) {
        sessions.delete(id);
      },
      onOutput: subscribe,
      onExit: subscribe,
      notifyTabSelection(
        sessionId: string | null,
        tabSessionIds: readonly string[],
      ) {
        snapshots.push({ sessionId, tabSessionIds });
        selection.tabSelected({ sessionId, tabSessionIds });
      },
      onTabCommand(listener: (command: TerminalTabCommand) => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      windowChrome() {},
      onWindowChrome: subscribe,
      onTitleBarToggle: subscribe,
      onFontZoom: subscribe,
      onConfigurationUpdate: subscribe,
      onClipboardAction: subscribe,
      onTabBarToggle: subscribe,
      onFind: subscribe,
      onTabTitle: subscribe,
      onLocalImageOpen: subscribe,
      onSnippetsToggle: subscribe,
      notifyTabsEmpty() {},
      syncTabTitle() {},
      title() {},
      bell() {},
      openExternalLink: async () => {},
      loadLocalImage: async () => null,
      writeClipboardText: async () => {},
      readClipboardText: async () => "",
      confirmPaste: async () => true,
      requestClipboardContextMenu() {},
      snippets: async () => ({ snippets: [] }),
      fontData: async () => {
        throw Error("No font read in headless Surface");
      },
    },
  };
  let releaseUnderlying!: () => void;
  const beforeReturn = new Promise<void>((resolve) => {
    releaseUnderlying = resolve;
  });
  Object.assign(window, {
    omxterm: bridge,
    surfacePort: {
      beforeReturn: scenario === "startup-titles" ? beforeReturn : undefined,
      get adoptions() {
        return adoptions;
      },
      set adoptions(value: number) {
        adoptions = value;
      },
    },
  });
  window.eval(await readFile(path.join(root, "renderer/index.js"), "utf8"));
  const state = () =>
    window.eval("globalThis.__omxtermTabRemovalControl.state()") as {
      heldSurface: boolean;
      newCommands: number;
      hostReady: boolean;
    };
  const send = (command: TerminalTabCommand) => {
    for (const listener of [...listeners]) listener(command);
  };
  let release!: () => void;
  const releaseAllowed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const renderer = {
    async executeJavaScript(script: string) {
      if (script === "globalThis.__omxtermTabRemovalControl.release()")
        await releaseAllowed;
      const result: unknown = window.eval(script);
      if (script.includes("waitForHost()") || script === "true") {
        boundaryCalls += 1;
        void Promise.resolve(result).then(
          () => {
            boundarySettled = true;
          },
          () => {},
        );
      }
      return result;
    },
    send(_channel: string, command: TerminalTabCommand) {
      send(command);
    },
  };
  const readiness = createTabRemovalReadiness(
    () => ({
      sessionCount: starts,
      initialSelected: selected === "s1",
      backgroundExited: false,
      native: null,
    }),
    (line) => phases.push(line),
  );
  return {
    state,
    markers,
    phases,
    selection,
    snapshots,
    readiness,
    renderer,
    get starts() {
      return starts;
    },
    get selected() {
      return selected;
    },
    get adoptions() {
      return adoptions;
    },
    get boundaryCalls() {
      return boundaryCalls;
    },
    get boundarySettled() {
      return boundarySettled;
    },
    get listeners() {
      return listeners.size;
    },
    release,
    send,
    releaseUnderlying,
    titlesReady: () =>
      window.eval("globalThis.__omxtermStartupTitlesHost.isReady()") as boolean,
    titlesWait: () =>
      window.eval(
        "globalThis.__omxtermStartupTitlesHost.wait()",
      ) as Promise<void>,
    pagehide: () => window.dispatchEvent(new window.Event("pagehide")),
    initial: () =>
      initialTabRemovalReadiness(renderer, {
        control,
        selected: () => selected,
        sessionCount: () => starts,
        readiness,
        mark: (name) => markers.push(TAB_REMOVAL_CONTROL_PREFIX + name),
      }),
    async dispose() {
      window.dispatchEvent(new window.Event("pagehide"));
      release();
      releaseUnderlying();
      dom.window.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
