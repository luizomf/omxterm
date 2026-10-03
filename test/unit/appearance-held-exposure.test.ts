import { Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { resttyAppearanceMainSource } from "../fixtures/restty-appearance-main";

// Execute the actual generated Electron main. Only Electron, files and time are
// external ports: no source rewriting or copied readiness implementation.
const colors = ["#314159", "#201012", "#90105a"];
const prefix = "__APPEARANCE__";
afterEach(() => vi.useRealTimers());

it.each([10, 1200])(
  "uses the completed first held capture when later captures take %i ms",
  async (captureDelay) => {
    const observed = await exerciseMain({ captureDelay });
    expect(observed.exit).toBe(0);
    expect(observed.result).toMatchObject({
      controlledReadiness: {
        firstSelectionPixels: 0,
        firstExactCopy: true,
        firstFrameCount: 2,
        heldDeadlineRejected: true,
        finalExactCopy: true,
        releasedCallbacks: 1,
        completedCallbacks: 1,
      },
      configuredFont: { preservesConfiguredRendering: true },
    });
    expect(observed.result!.controlledReadiness.heldCaptures).toBeGreaterThan(
      0,
    );
    expect(observed.releasedAt).toBe(2028);
    expect(observed.captureStarts[0]).toBe(0);
    expect(observed.captureStarts[1]).toBe(1028);
    expect(observed.result!.colorCounts["#314159"]).toBe(1);
    expect(observed.result!.colorCounts["#201012"]).toBe(2);
    expect(observed.result!.colorCounts["#90105a"]).toBe(1);
  },
);

it.each([
  {
    fault: "no initial capture",
    error: "Selection capture readiness deadline exceeded",
  },
  {
    fault: "painted while held",
    error:
      "Controlled gate did not reproduce capture-before-readiness rejection",
  },
  {
    fault: "painted later while held",
    error: "Permanently held frames incorrectly became capture-ready",
  },
  {
    fault: "lost selection",
    error: "Controlled selection or gate was lost before release",
  },
  { fault: "renderer gone", error: "Renderer unavailable" },
  {
    fault: "never paints after release",
    error: "Selection capture readiness deadline exceeded",
  },
] as const)(
  "does not accept $fault as held-frame evidence",
  async ({ fault, error }) => {
    const observed = await exerciseMain({ captureDelay: 1200, fault });
    expect(observed.exit).toBe(1);
    expect(observed.result).toBeUndefined();
    expect(observed.stderr).toContain(error);
  },
);

type Fault =
  | "no initial capture"
  | "painted while held"
  | "painted later while held"
  | "lost selection"
  | "renderer gone"
  | "never paints after release";
interface Result {
  controlledReadiness: { heldCaptures: number };
  colorCounts: Record<string, number>;
}
async function exerciseMain(options: { captureDelay: number; fault?: Fault }) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let held = true;
  let frameCount = 2;
  let captureCount = 0;
  let releasedAt: number | undefined;
  let exit: number | undefined;
  let stdout = "";
  let stderr = "";
  const captureStarts: number[] = [];
  const bitmap = (painted: boolean) =>
    Buffer.from([
      ...(painted ? [0x31, 0x41, 0x59, 255] : []),
      0x20,
      0x10,
      0x12,
      255,
      0x20,
      0x10,
      0x12,
      255,
      0x90,
      0x10,
      0x5a,
      255,
    ]);
  class Window {
    webContents = {
      executeJavaScript: async (script: string) => {
        if (script.includes("__omxtermResttyAppearanceResult"))
          return {
            devicePixelRatio: 1,
            live: { cellWidth: 8, cellHeight: 16 },
          };
        if (script.includes("getBoundingClientRect")) return { x: 0, y: 0 };
        if (script.includes("__omxtermReleaseSelectionFrames")) {
          held = false;
          releasedAt = Date.now();
          return;
        }
        if (script.includes("__omxtermSelectionFrame")) {
          frameCount += 1;
          return;
        }
        if (script.includes("__omxtermSelectionState")) {
          if (Date.now() >= 2028 && options.fault === "renderer gone")
            throw new Error("Renderer unavailable");
          return {
            exactCopy: !(
              Date.now() >= 2028 && options.fault === "lost selection"
            ),
            gateHeld: held,
            heldCallbacks: held ? [7] : [],
            frameCount,
            releasedCallbacks: held ? 0 : 1,
            releasedFrameTimes: held ? [] : [Date.now()],
          };
        }
      },
      capturePage: async (region?: unknown) => {
        const number = ++captureCount;
        const painted =
          (!held && options.fault !== "never paints after release") ||
          options.fault === "painted while held" ||
          (number > 1 && options.fault === "painted later while held");
        const image = {
          toBitmap: () => bitmap(painted),
          toPNG: () => Buffer.alloc(0),
        };
        if (region) return image;
        captureStarts.push(Date.now());
        if (number === 1 && options.fault === "no initial capture")
          return new Promise<never>(() => {});
        const delay =
          number === 1
            ? 1028
            : options.fault === "painted later while held" && held
              ? 10
              : options.captureDelay;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return image;
      },
      getLastWebPreferences: () => ({}),
    };
    async loadFile() {}
    showInactive() {}
    destroy() {}
    isDestroyed() {
      return false;
    }
  }
  runInNewContext(resttyAppearanceMainSource(colors, prefix), {
    Date,
    setTimeout,
    clearTimeout,
    __dirname: "/synthetic-fixture",
    process: {
      env: {
        OMXTERM_RESTTY_APPEARANCE_GATE_FRAMES: "1",
        OMXTERM_RESTTY_APPEARANCE_ARTIFACT_DIRECTORY: "/synthetic-evidence",
      },
      stdout: {
        write: (text: string) => {
          stdout += text;
        },
      },
      stderr: {
        write: (text: string) => {
          stderr += text;
        },
      },
    },
    require: (name: string) => {
      if (name === "electron")
        return {
          app: {
            setPath() {},
            whenReady: () => Promise.resolve(),
            exit: (code: number) => {
              exit = code;
            },
          },
          BrowserWindow: Window,
        };
      if (name === "node:fs")
        return { mkdirSync() {}, writeFileSync() {}, cpSync() {} };
      if (name === "node:path")
        return {
          join: (...parts: string[]) => parts.join("/"),
          basename: (value: string) => value.split("/").at(-1),
        };
      if (name === "./selection.cjs")
        return {
          exerciseAppearanceSelection: async () => ({
            beforeFrame: true,
            afterFrame: true,
          }),
        };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  await vi.advanceTimersByTimeAsync(15000);
  const line = stdout.split("\n").find((value) => value.startsWith(prefix));
  return {
    exit,
    stderr,
    releasedAt,
    captureStarts,
    result: line
      ? (JSON.parse(line.slice(prefix.length)) as Result)
      : undefined,
  };
}
