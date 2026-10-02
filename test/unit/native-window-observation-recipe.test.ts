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
  const require = createRequire(import.meta.url);
  class NativeWindow {
    visible = false;
    minimized = mode === "initial-minimized";
    maximized = mode === "initial-maximized";
    destroyed = mode === "initial-destroyed";
    constructor(options: Record<string, unknown>) {
      constructions.push(options);
    }
    webContents = {
      executeJavaScript: async () => {
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
      if (mode !== "unavailable") this.minimized = true;
    }
    restore() {
      if (mode !== "failed-restore") this.minimized = false;
    }
    hide() {
      this.visible = false;
    }
    maximize() {
      if (mode === "action-error")
        throw new Error("controlled native action error");
      if (mode === "hidden-during-action") this.visible = false;
      else if (mode !== "unavailable") this.maximized = true;
    }
    unmaximize() {
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
