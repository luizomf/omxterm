import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { readNativeWindowObservation } from "../fixtures/window-policy";

let source: string;
beforeAll(async () => {
  const compiled = await build({
    entryPoints: ["test/fixtures/native-window-observation-main.ts"],
    bundle: true,
    external: ["electron"],
    format: "cjs",
    platform: "node",
    write: false,
  });
  source = compiled.outputFiles[0]!.text;
});
afterEach(() => vi.useRealTimers());

async function observe(
  mode: string,
  kind: "cursor" | "chrome" = "cursor",
  platform = "linux",
) {
  vi.useFakeTimers();
  const request = {
    id: "00000000-0000-0000-0000-000000000001",
    kind,
    platform,
    dpr: 1,
  };
  let stdout = "",
    stderr = "",
    exitCode: number | undefined;
  const constructions: Record<string, unknown>[] = [];
  const nativeCalls: string[] = [];
  const require = createRequire(import.meta.url);
  class NativeWindow {
    visible = false;
    minimized = mode === "initial-minimized";
    maximized = mode === "initial-maximized";
    destroyed = mode === "initial-destroyed";
    healthChecks = 0;
    constructor(options: Record<string, unknown>) {
      constructions.push(options);
    }
    webContents = {
      executeJavaScript: async () => {
        await Promise.resolve();
        this.healthChecks += 1;
        if (this.healthChecks === 1) {
          if (mode === "initial-health-maximizes") this.maximized = true;
          if (mode === "initial-health-minimizes") this.minimized = true;
          if (mode === "initial-health-hides") this.visible = false;
        }
        if (
          this.healthChecks === 2 &&
          mode === "absent-maximize-health-maximizes"
        )
          this.maximized = true;
        if (this.healthChecks === 3) {
          if (mode === "restore-health-remaximizes") this.maximized = true;
          if (mode === "hide-health-reshows") this.visible = true;
        }
        if (mode === "lost-transition") {
          this.minimized = false;
          this.maximized = false;
        }
        return mode !== "unhealthy-renderer";
      },
    };
    async loadFile() {
      if (mode === "load-error") throw new Error("controlled load error");
    }
    showInactive() {
      this.visible = mode !== "initial-hidden";
    }
    isVisible() {
      return this.visible;
    }
    isMinimized() {
      return this.minimized;
    }
    isMaximized() {
      return this.maximized;
    }
    isFullScreen() {
      return false;
    }
    isDestroyed() {
      return this.destroyed;
    }
    getBounds() {
      return { width: mode === "empty-bounds" ? 0 : 900, height: 600 };
    }
    minimize() {
      nativeCalls.push("minimize");
      if (
        ![
          "unavailable",
          "hide-health-reshows",
          "initial-health-minimizes",
        ].includes(mode)
      )
        this.minimized = true;
    }
    restore() {
      nativeCalls.push("restore");
      if (mode !== "failed-restore") this.minimized = false;
    }
    hide() {
      nativeCalls.push("hide");
      this.visible = false;
    }
    maximize() {
      nativeCalls.push("maximize");
      if (mode === "action-error")
        throw new Error("controlled native action error");
      if (mode === "hidden-during-action") this.visible = false;
      else if (
        ![
          "unavailable",
          "initial-health-maximizes",
          "absent-maximize-health-maximizes",
        ].includes(mode)
      )
        this.maximized = true;
    }
    unmaximize() {
      nativeCalls.push("unmaximize");
      if (mode !== "failed-restore") this.maximized = false;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  runInNewContext(source, {
    __dirname: "/owned-synthetic-profile",
    exports: {},
    module: { exports: {} },
    process: {
      platform,
      argv: [`--observation-id=${request.id}`, `--observation-kind=${kind}`],
      stdout: {
        write: (text: string) => {
          stdout += text;
        },
      },
    },
    console: {
      error: (error: Error) => {
        stderr += error.message;
      },
    },
    setTimeout,
    clearTimeout,
    Date,
    require(id: string) {
      if (id === "electron")
        return {
          BrowserWindow: NativeWindow,
          app: {
            on() {},
            setPath() {},
            whenReady: async () => {},
            commandLine: { getSwitchValue: () => "1" },
            quit: () => {
              exitCode = 0;
            },
            exit: (value: number) => {
              exitCode = value;
            },
          },
        };
      if (id === "node:fs/promises") return { mkdir: async () => {} };
      return require(id) as unknown;
    },
  });
  await vi.runAllTimersAsync();
  return {
    request,
    constructions,
    nativeCalls,
    result: {
      stdout,
      stderr,
      exitCode: exitCode ?? null,
      signal: null,
      reason: "exit",
      cleanupErrors: [],
    },
  };
}

it.each(["cursor", "chrome"] as const)(
  "observes actual %s transitions and successful restoration through the raw recipe",
  async (kind) => {
    const { result, request } = await observe("standard", kind);
    expect(readNativeWindowObservation(result, request)).toBe(
      kind === "cursor" ? "early-minimize" : "native-maximize-observed",
    );
  },
);
it("observes complete independent absence and a real hide without treating a request as a transition", async () => {
  const { result, request } = await observe("unavailable");
  expect(readNativeWindowObservation(result, request)).toBe("early-hide");
  expect(
    (
      JSON.parse(result.stdout.split("__OMXTERM_NATIVE_WINDOW__")[1]!) as {
        observations: { elapsedMs: number }[];
      }
    ).observations[0]!.elapsedMs,
  ).toBe(25000);
});
it.each([
  "initial-minimized",
  "initial-hidden",
  "initial-maximized",
  "initial-destroyed",
  "empty-bounds",
  "unhealthy-renderer",
  "load-error",
  "failed-restore",
  "lost-transition",
])(
  "rejects unhealthy/failed cursor recipe %s before reporting a capability",
  async (mode) => {
    const { result, request } = await observe(mode);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain("__OMXTERM_NATIVE_WINDOW__");
    expect(() => readNativeWindowObservation(result, request)).toThrow();
  },
);
it.each([
  "failed-restore",
  "lost-transition",
  "action-error",
  "hidden-during-action",
])("rejects invalid maximize recipe %s", async (mode) => {
  const { result, request } = await observe(mode, "chrome");
  expect(result.exitCode).toBe(1);
  expect(() => readNativeWindowObservation(result, request)).toThrow();
});
it.each([
  ["initial-health-maximizes", "chrome"],
  ["initial-health-minimizes", "cursor"],
  ["restore-health-remaximizes", "chrome"],
  ["hide-health-reshows", "cursor"],
  ["absent-maximize-health-maximizes", "chrome"],
] as const)(
  "rejects %s at actual raw action/commit boundaries",
  async (mode, kind) => {
    const { result, request } = await observe(mode, kind);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain("__OMXTERM_NATIVE_WINDOW__");
    expect(() => readNativeWindowObservation(result, request)).toThrow();
  },
);
it.each([
  "initial-health-maximizes",
  "initial-health-hides",
  "initial-health-minimizes",
])(
  "does not invoke a native action after initial health invalidates starting state: %s",
  async (mode) => {
    const { nativeCalls, result } = await observe(mode, "chrome");
    expect(result.exitCode).toBe(1);
    expect(nativeCalls).toEqual([]);
  },
);
it("independently specifies Windows frameless nontransparent native construction", async () => {
  const { constructions } = await observe("standard", "chrome", "win32");
  expect(constructions[0]).toMatchObject({
    frame: true,
    transparent: false,
    resizable: true,
    maximizable: true,
  });
  expect(constructions[1]).toMatchObject({
    frame: false,
    transparent: false,
    resizable: true,
    maximizable: true,
  });
});
