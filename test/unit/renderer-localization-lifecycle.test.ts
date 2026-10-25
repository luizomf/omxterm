// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { harness } from "../fixtures/restty-surface-harness";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";

const configuration: TerminalRendererConfiguration = {
  language: "en-US",
  transparency: 0,
  showTabBar: true,
  fontSize: 16,
  fontLineHeight: 1,
  fontLigatures: true,
  terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
  scrollbackLines: 10_000,
  optionKeyMode: "none",
  nativeTitleInset: 0,
  terminalTheme: DEFAULT_TERMINAL_THEME,
  userFileErrors: [],
};
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  harness.instances.length = 0;
  harness.setInitGate(undefined);
  harness.setInitError(undefined);
  document.body.replaceChildren();
});
function fixture(initial = configuration) {
  document.documentElement.lang = "en";
  document.body.innerHTML =
    '<nav id="tab-strip" aria-label="Terminal Tabs"></nav><div id="terminal-tabs"></div><section id="user-file-errors" role="alert" aria-label="User File Errors" hidden></section><section id="terminal-surface-failure" role="alert" aria-label="Terminal Surface Failure" hidden></section>';
  const tabStrip = document.querySelector<HTMLElement>("nav")!;
  const tabsContainer = document.querySelector<HTMLElement>("#terminal-tabs")!;
  let update!: (value: TerminalRendererConfiguration) => void;
  let command!: (value: TerminalTabCommand) => void;
  const adapters: ReturnType<typeof createAdapter>[] = [];
  const onSurfaceFailure = vi.fn();
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      page: window,
      configuration: initial,
      onSurfaceFailure,
      userFileErrorBanner:
        document.querySelector<HTMLElement>("#user-file-errors")!,
      surfaceFailureBanner: document.querySelector<HTMLElement>(
        "#terminal-surface-failure",
      )!,
      createAdapter() {
        const adapter = createAdapter();
        adapters.push(adapter);
        return adapter;
      },
      async mount(container, adapter, options) {
        vi.spyOn(
          container.closest<HTMLElement>(".terminal-tab")!,
          "getBoundingClientRect",
        ).mockReturnValue({ width: 1200, height: 800 } as DOMRect);
        vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
          width: 1200,
          height: 800,
        } as DOMRect);
        // Model Restty's owned search DOM, while exercising the production
        // Surface's label application and the production host/tab lifecycle.
        container.innerHTML = '<div role="search"><input></div>';
        const surface = await mountResttyTerminalSurface(
          container,
          adapter,
          options,
        );
        const runtime = harness.instances.find(
          (instance) => instance.options.root === container,
        )!;
        runtime.canvas.width = 1200;
        runtime.canvas.height = 800;
        vi.spyOn(runtime.canvas, "getBoundingClientRect").mockReturnValue({
          width: 1200,
          height: 800,
        } as DOMRect);
        runtime.options.services.ptyTransport.resize(120, 40, {
          widthPx: 1200,
          heightPx: 800,
          cellW: 10,
          cellH: 20,
        });
        return surface;
      },
      subscribeToConfigurationUpdates(listener) {
        update = listener;
        return () => {};
      },
      subscribeToTabCommands(listener) {
        command = listener;
        return () => {};
      },
    },
  );
  cleanups.push(host.dispose);
  return {
    host,
    tabStrip,
    tabsContainer,
    adapters,
    onSurfaceFailure,
    update,
    command: (value: TerminalTabCommand) => command(value),
  };
}
function createAdapter() {
  return {
    sessionId: () => undefined,
    start: vi.fn(async () => {}),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  };
}

describe("window localization lifecycle", () => {
  it("labels the document and application regions on startup and both switch directions", async () => {
    const f = fixture({ ...configuration, language: "pt-BR" });
    await f.host.ready;
    const names = () => [
      document.documentElement.lang,
      f.tabStrip.getAttribute("aria-label"),
      document.querySelector("#user-file-errors")!.getAttribute("aria-label"),
      document
        .querySelector("#terminal-surface-failure")!
        .getAttribute("aria-label"),
    ];
    const portuguese = [
      "pt-BR",
      "Abas do terminal",
      "Erros nos arquivos do usuário",
      "Falha na superfície do terminal",
    ];
    expect(names()).toEqual(portuguese);
    f.update(configuration);
    expect(names()).toEqual([
      "en-US",
      "Terminal Tabs",
      "User File Errors",
      "Terminal Surface Failure",
    ]);
    f.update({ ...configuration, language: "pt-BR" });
    expect(names()).toEqual(portuguese);
    f.host.dispose();
    f.update(configuration);
    expect(names()).toEqual(portuguese);
  });
  it.each(["initialization", "backend-loss"])(
    "relabels a visible %s failure without restarting sessions",
    async (failure) => {
      if (failure === "initialization")
        harness.setInitError(new Error("<img src=x> unavailable"));
      const f = fixture({ ...configuration, language: "pt-BR" });
      if (failure === "initialization")
        await expect(f.host.ready).rejects.toThrow("Failed to mount");
      else {
        await f.host.ready;
        harness.instances[0]!.canvas.dispatchEvent(
          new Event("webglcontextlost", { cancelable: true }),
        );
      }
      const banner = document.querySelector<HTMLElement>(
        "#terminal-surface-failure",
      )!;
      const portuguese =
        failure === "initialization"
          ? "Falha ao inicializar a superfície do terminal do OMXTerm: <img src=x> unavailable"
          : "O backend de renderização da superfície do terminal do OMXTerm foi perdido";
      const english =
        failure === "initialization"
          ? "Failed to initialize the OMXTerm Terminal Surface: <img src=x> unavailable"
          : "The OMXTerm Terminal Surface rendering backend was lost";
      expect(f.onSurfaceFailure).toHaveBeenLastCalledWith(portuguese);
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toBe(portuguese);
      f.update(configuration);
      expect(banner.textContent).toBe(english);
      f.update({ ...configuration, language: "pt-BR" });
      expect(banner.textContent).toBe(portuguese);
      expect(banner.querySelector("img")).toBeNull();
      expect(harness.instances).toHaveLength(1);
      expect(harness.instances[0]!.destroy).toHaveBeenCalledOnce();
      expect(f.adapters[0]!.close).toHaveBeenCalledOnce();
      expect(f.adapters[0]!.start).toHaveBeenCalledTimes(
        failure === "initialization" ? 0 : 1,
      );
      f.host.dispose();
      f.update(configuration);
      expect(banner.textContent).toBe(portuguese);
    },
  );

  it("uses the latest language for a failure that settles after a pending language switch", async () => {
    let finish!: () => void;
    harness.setInitGate(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const f = fixture();
    const readiness = expect(f.host.ready).rejects.toThrow("Failed to mount");
    await vi.waitFor(() =>
      expect(harness.instances[0]?.state).toBe("initializing"),
    );
    f.update({ ...configuration, language: "pt-BR" });
    harness.setInitError(new Error("backend unavailable"));
    finish();
    await readiness;
    const banner = document.querySelector<HTMLElement>(
      "#terminal-surface-failure",
    )!;
    expect(banner.textContent).toBe(
      "Falha ao inicializar a superfície do terminal do OMXTerm: backend unavailable",
    );
    expect(f.adapters[0]!.start).not.toHaveBeenCalled();
    expect(f.adapters[0]!.close).toHaveBeenCalledOnce();
  });

  it.each(["first", "new", "split"])(
    "keeps the latest language when the %s tab finishes mounting",
    async (tab) => {
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      if (tab === "first") harness.setInitGate(gate);
      const f = fixture();
      if (tab !== "first") {
        await f.host.ready;
        harness.setInitGate(gate);
        f.command(
          tab === "new"
            ? { action: "new" }
            : { action: "split", direction: "right" },
        );
      }
      const index = tab === "first" ? 0 : 1;
      await vi.waitFor(() =>
        expect(harness.instances[index]?.state).toBe("initializing"),
      );
      const container = f.tabsContainer.querySelectorAll(
        "main.terminal-surface",
      )[index]!;
      const search = container.querySelector("input")!;
      search.value = "retained query";
      expect(search.placeholder).toBe("Find in scrollback");
      f.update({ ...configuration, language: "pt-BR" });
      finish();
      await vi.waitFor(() =>
        expect(f.adapters[index]!.start).toHaveBeenCalledOnce(),
      );
      await f.host.ready;
      expect(container.getAttribute("aria-label")).toBe(
        "Superfície do terminal",
      );
      await vi.waitFor(() =>
        expect(search.placeholder).toBe("Buscar no histórico"),
      );
      expect(search.value).toBe("retained query");
      const divider = f.tabsContainer.querySelector(".terminal-pane-divider");
      if (tab === "split")
        expect(divider!.getAttribute("aria-label")).toBe(
          "Redimensionar painéis",
        );
      f.update({ ...configuration, language: "pt-BR" });
      expect(search.placeholder).toBe("Buscar no histórico");
      f.update(configuration);
      expect(search.placeholder).toBe("Find in scrollback");
      if (tab === "split") {
        expect(f.tabsContainer.querySelector(".terminal-pane-divider")).toBe(
          divider,
        );
        expect(divider!.getAttribute("aria-label")).toBe("Resize panes");
      }
      expect(harness.instances).toHaveLength(index + 1);
      for (const adapter of f.adapters) {
        expect(adapter.start).toHaveBeenCalledOnce();
        expect(adapter.close).not.toHaveBeenCalled();
      }
    },
  );
});
