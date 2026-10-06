import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Execute the real fixture main and registered parent test. Only Electron's
// renderer/capture boundary and child execution/I/O are simulated: no GUI.
const require = createRequire(import.meta.url);
const parentFile = path.resolve(
  "test/integration/restty-font-styles-rendering.test.ts",
);
let parentCode: string;
let root: string;
type TestBody = (context: {
  onTestFinished(callback: () => Promise<void>): void;
}) => Promise<void>;
interface Report {
  result: { error?: string; requests: number };
  phases: { name: string; ink?: { centerColumnInk: number } }[];
  retention?: {
    status: string;
    error?: { code: string; operation: string; phase?: string };
  };
}
interface Scenario {
  primary: "success" | "renderer-error" | "pixel-failure";
  retentionFails: boolean;
  encodingFails?: boolean;
  observationWriteFails?: boolean;
  faultVariant?: "current-regular" | "prior-regular";
  enabled?: boolean;
}

beforeAll(async () => {
  const bundle = await build({
    entryPoints: [parentFile],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["vitest", "esbuild"],
    write: false,
    define: {
      "import.meta.url": JSON.stringify(pathToFileURL(parentFile).href),
    },
  });
  parentCode = bundle.outputFiles[0]!.text;
});
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), "omxterm-font-report-unit-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function bitmap(
  name: string,
  mode: string,
  prior: boolean,
  pixelFailure: boolean,
) {
  const buffer = Buffer.alloc(12 * 18 * 4);
  const pixel = (x: number, y: number, value: number) =>
    buffer.fill(value, (y * 12 + x) * 4, (y * 12 + x) * 4 + 3);
  if (name === "blank") return buffer;
  if (name.startsWith("stroke")) {
    const thickness =
      name === "strokeRegular" ? 3 : prior ? (pixelFailure ? 10 : 3) : 5;
    const top = thickness === 10 ? 4 : thickness === 5 ? 6 : 7;
    for (let y = 2; y <= 15; y++)
      for (let x = 2; x <= 10; x++)
        if (x === 2 || x === 10 || (y >= top && y < top + thickness))
          pixel(x, y, 90);
    return buffer;
  }
  const styled = mode === "styled";
  const values: Record<string, number> = {
    regular: 40,
    bold: styled ? 100 : prior ? 60 : 75,
    italic: styled ? 65 : 50,
    boldItalic: styled || mode === "partial" ? 120 : prior ? 70 : 90,
    wideItalic: 40,
    wideBoldItalic: 80,
  };
  pixel(2, 2, values[name]!);
  return buffer;
}

async function runScenario(scenario: Scenario) {
  const reports: Report[] = [];
  const diagnostics: string[] = [];
  const exits: number[] = [];
  let destroyed = 0;
  let encodings = 0;
  const jsonPath = path.join(root, "observations.json");
  const safeConsole = {
    error: (...values: unknown[]) =>
      diagnostics.push(
        values
          .map((value) =>
            typeof value === "string" ? value : JSON.stringify(value),
          )
          .join(" "),
      ),
  };
  const executeChild = async (
    _executable: string,
    args: string[],
    options: { env: Record<string, string | undefined> },
  ) => {
    const profile = args[1]!;
    const mode = args[2]!;
    const renderer = await fs.readFile(
      path.join(profile, "renderer.js"),
      "utf8",
    );
    const prior = /BOLD_OFFSET = 0\.06/u.test(renderer);
    const faultRegular =
      mode === "regular" &&
      (scenario.faultVariant === "prior-regular" ? prior : !prior);
    const handlers = new Map<string, (...args: unknown[]) => Promise<void>>();
    const events = new Map<string, (...args: unknown[]) => void>();
    let phaseName = "blank";
    let stdout = "";
    let finish!: (code: number) => void;
    const done = new Promise<number>((resolve) => {
      finish = resolve;
    });
    class Window {
      webContents = {
        debugger: {
          attach() {},
          async sendCommand() {
            return {};
          },
        },
        async capturePage() {
          const capturedPhase = phaseName;
          const bytes = bitmap(
            phaseName,
            mode,
            prior,
            scenario.primary === "pixel-failure",
          );
          return {
            toBitmap: () => bytes,
            getSize: () => ({ width: 12, height: 18 }),
            toPNG: () => {
              encodings++;
              if (scenario.encodingFails && faultRegular)
                throw new Error("encoder /private/path raw payload");
              return Buffer.from(`mock-encoded-${capturedPhase}`);
            },
          };
        },
      };
      destroy() {
        destroyed++;
      }
      showInactive() {}
      async loadFile() {
        const phase = async (name: string, capture = true, leases = 1) => {
          phaseName = name;
          await handlers.get("phase")!(
            {},
            name,
            capture,
            { sources: 1, parsed: 1, leases, bytes: 10 },
            { right: 100, bottom: 100 },
          );
        };
        await phase("one-startup", false);
        for (const name of [
          "blank",
          "regular",
          "bold",
          "italic",
          "boldItalic",
          "wideItalic",
          "wideBoldItalic",
          "strokeRegular",
          "strokeBold",
        ])
          await phase(name);
        await phase("three-live", false, 3);
        await phase("back-to-one", false);
        await phase("disposed", false, 0);
        events.get("report")!(
          {},
          {
            requests: 1,
            picks: {},
            replies: [],
            dpr: 1,
            ...(scenario.primary === "renderer-error" && faultRegular
              ? { error: "Synthetic original renderer failure" }
              : {}),
          },
        );
      }
    }
    const electron = {
      app: {
        commandLine: { appendSwitch() {} },
        setPath() {},
        whenReady: async () => {},
        getAppMetrics: () => [],
        exit(code: number) {
          exits.push(code);
          finish(code);
        },
      },
      BrowserWindow: Window,
      ipcMain: {
        handle(name: string, handler: (...args: unknown[]) => Promise<void>) {
          handlers.set(name, handler);
        },
        on(name: string, handler: (...args: unknown[]) => void) {
          events.set(name, handler);
        },
      },
    };
    const childFs = {
      ...fs,
      writeFile: (...values: Parameters<typeof fs.writeFile>) => {
        if (
          scenario.retentionFails &&
          faultRegular &&
          String(values[0]).endsWith(".png")
        )
          return Promise.reject(
            Object.assign(
              new Error("write failed /private/path and raw payload"),
              { code: "EACCES" },
            ),
          );
        return fs.writeFile(...values);
      },
    };
    const childRequire = (id: string): unknown =>
      id === "electron"
        ? electron
        : id === "node:fs/promises"
          ? childFs
          : (require(id) as unknown);
    const code = await fs.readFile(args[0]!, "utf8");
    (
      new Function("require", "process", "console", "setTimeout", code) as (
        ...parameters: unknown[]
      ) => void
    )(
      childRequire,
      {
        platform: "linux",
        versions: process.versions,
        argv: ["mock-node", "mock-electron", profile, mode, args[3]],
        env: options.env,
        stdout: {
          write(value: string) {
            stdout += value;
          },
        },
      },
      safeConsole,
      () => ({ unref() {} }),
    );
    const exit = await done;
    if (stdout)
      reports.push(JSON.parse(stdout.trim().split("\n").at(-1)!) as Report);
    if (exit) throw new Error(`Synthetic child execution exit ${exit}`);
    return { stdout, stderr: "" };
  };
  const execFile = Object.assign(
    () => {
      throw new Error("Expected promisified child execution");
    },
    { [promisify.custom]: executeChild },
  );
  const bodies = new Map<string, TestBody>();
  const parentRequire = (id: string): unknown => {
    if (id === "vitest")
      return {
        describe: (_name: string, callback: () => void) => callback(),
        it: (name: string, body: TestBody) => bodies.set(name, body),
        expect,
      };
    if (id === "node:child_process") return { execFile };
    if (id === "node:fs/promises" && scenario.observationWriteFails)
      return {
        ...fs,
        open: async (...values: Parameters<typeof fs.open>) => {
          const file = await fs.open(...values);
          return {
            writeFile: async () => {
              throw Object.assign(new Error("JSON /private/path raw payload"), {
                code: "EIO",
              });
            },
            close: () => file.close(),
          };
        },
      };
    return require(id) as unknown;
  };
  (
    new Function(
      "require",
      "module",
      "exports",
      "process",
      "console",
      parentCode,
    ) as (...parameters: unknown[]) => void
  )(
    parentRequire,
    { exports: {} },
    {},
    {
      platform: "linux",
      env:
        scenario.enabled === false
          ? {}
          : { OMXTERM_FONT_STYLES_EVIDENCE_PATH: jsonPath },
    },
    safeConsole,
  );
  const body = [...bodies.entries()].find(([name]) =>
    name.startsWith("renders exact styles"),
  )![1];
  const cleanup: (() => Promise<void>)[] = [];
  let error: unknown;
  try {
    await body({
      onTestFinished: (callback) => {
        cleanup.push(callback);
      },
    });
  } catch (caught) {
    error = caught;
  } finally {
    for (const callback of cleanup) await callback();
  }
  return { reports, diagnostics, exits, destroyed, encodings, error, jsonPath };
}

describe("font report to parent failure priority", () => {
  it.each([false, true])(
    "preserves renderer failure and Observation when retention fails=%s",
    async (retentionFails) => {
      const outcome = await runScenario({
        primary: "renderer-error",
        retentionFails,
      });
      expect(outcome.error).toBeInstanceOf(Error);
      expect((outcome.error as Error).message).toContain(
        "Synthetic original renderer failure",
      );
      expect(outcome.reports[0]!.result.error).toBe(
        "Synthetic original renderer failure",
      );
      expect(outcome.reports[0]!.phases).toHaveLength(13);
      expect(outcome.reports[0]!.retention?.status).toBe(
        retentionFails ? "failed" : "written",
      );
      const saved = JSON.parse(await fs.readFile(outcome.jsonPath, "utf8")) as {
        regular: Report;
      };
      expect(saved.regular).toEqual(outcome.reports[0]);
      expect(outcome.exits).toEqual([0]);
      expect(outcome.destroyed).toBe(1);
    },
    20_000,
  );

  it.each([false, true])(
    "checks retention after successful original assertions when retention fails=%s",
    async (retentionFails) => {
      const outcome = await runScenario({ primary: "success", retentionFails });
      if (retentionFails) {
        expect(outcome.error).toBeInstanceOf(Error);
        expect((outcome.error as Error).message).toContain(
          "Font style evidence retention failed",
        );
        expect((outcome.error as Error).message).toContain("EACCES");
        expect(outcome.reports[0]!.retention?.error).toMatchObject({
          operation: "write-image",
          code: "EACCES",
          phase: "blank",
        });
      } else expect(outcome.error).toBeUndefined();
      expect(outcome.reports).toHaveLength(5);
      expect(outcome.exits).toEqual([0, 0, 0, 0, 0]);
      expect(outcome.destroyed).toBe(5);
      const saved = JSON.parse(await fs.readFile(outcome.jsonPath, "utf8")) as {
        regular: Report;
        priorRegular: Report;
      };
      expect(saved.regular).toEqual(outcome.reports[0]);
      expect(saved.priorRegular).toEqual(outcome.reports[4]);
      expect(JSON.stringify(outcome.reports[0]!.retention)).not.toContain(
        "/private/",
      );
      expect(outcome.diagnostics.join("\n")).not.toContain("raw payload");
    },
    20_000,
  );

  it("preserves prior-regular renderer failure and all available observations on retention failure", async () => {
    const outcome = await runScenario({
      primary: "renderer-error",
      retentionFails: true,
      faultVariant: "prior-regular",
    });
    expect((outcome.error as Error).message).toContain(
      "Synthetic original renderer failure",
    );
    expect(outcome.reports).toHaveLength(5);
    const saved = JSON.parse(
      await fs.readFile(outcome.jsonPath, "utf8"),
    ) as Record<string, Report>;
    expect(saved.regular).toEqual(outcome.reports[0]);
    expect(saved.priorRegular).toEqual(outcome.reports[4]);
    expect(saved.priorRegular!.retention?.status).toBe("failed");
    expect(outcome.exits).toEqual([0, 0, 0, 0, 0]);
    expect(outcome.destroyed).toBe(5);
  }, 20_000);

  it("keeps the original pixel assertion ahead of a simultaneous retention failure", async () => {
    const outcome = await runScenario({
      primary: "pixel-failure",
      retentionFails: true,
    });
    expect((outcome.error as Error).message).toContain(
      "expected 5 to be greater than 10",
    );
    const saved = JSON.parse(await fs.readFile(outcome.jsonPath, "utf8")) as {
      regular: Report;
      priorRegular: Report;
    };
    expect(saved.regular.retention?.status).toBe("failed");
    expect(
      saved.regular.phases.find((phase) => phase.name === "strokeBold")!.ink!
        .centerColumnInk,
    ).toBe(5);
    expect(
      saved.priorRegular.phases.find((phase) => phase.name === "strokeBold")!
        .ink!.centerColumnInk,
    ).toBe(10);
    expect(outcome.exits).toEqual([0, 0, 0, 0, 0]);
  }, 20_000);

  it("reports encoding failure without leaking its message or passing the test", async () => {
    const outcome = await runScenario({
      primary: "success",
      retentionFails: false,
      encodingFails: true,
    });
    expect((outcome.error as Error).message).toContain(
      "Font style evidence retention failed",
    );
    expect(outcome.reports[0]!.retention?.error).toEqual({
      operation: "encode-image",
      code: "UNKNOWN",
      phase: "blank",
    });
    const saved = JSON.parse(await fs.readFile(outcome.jsonPath, "utf8")) as {
      regular: Report;
    };
    expect(saved.regular).toEqual(outcome.reports[0]);
    expect(JSON.stringify(saved.regular.retention)).not.toContain("/private/");
    expect(outcome.diagnostics.join("\n")).not.toContain("raw payload");
  }, 20_000);

  it.each(["success", "renderer-error", "pixel-failure"] as const)(
    "keeps primary=%s priority when writing the Observation JSON fails",
    async (primary) => {
      const outcome = await runScenario({
        primary,
        retentionFails: false,
        observationWriteFails: true,
      });
      const message = (outcome.error as Error).message;
      if (primary === "success") {
        expect(message).toContain("Font style evidence retention failed");
        expect(message).toContain("write-observations");
      } else if (primary === "renderer-error")
        expect(message).toContain("Synthetic original renderer failure");
      else expect(message).toContain("expected 5 to be greater than 10");
      expect(outcome.reports[0]!.retention?.status).toBe("written");
      expect(outcome.reports[0]!.phases).toHaveLength(13);
      expect(await fs.readFile(outcome.jsonPath, "utf8")).toBe("");
      const entries = await fs.readdir(root);
      const captureRoot = path.join(
        root,
        entries.find((name) => name.startsWith("font-style-captures-"))!,
      );
      expect(
        await fs.readdir(path.join(captureRoot, "current-regular")),
      ).toContain("manifest.json");
      expect(outcome.diagnostics.join("\n")).toContain("EIO");
      expect(outcome.diagnostics.join("\n")).not.toContain("/private/");
      expect(outcome.diagnostics.join("\n")).not.toContain("raw payload");
      expect(outcome.exits.every((code) => code === 0)).toBe(true);
      expect(outcome.destroyed).toBe(outcome.reports.length);
    },
    20_000,
  );

  it("leaves disabled/default reports and encoding behavior unchanged", async () => {
    const outcome = await runScenario({
      primary: "success",
      retentionFails: true,
      enabled: false,
    });
    expect(outcome.error).toBeUndefined();
    expect(outcome.reports).toHaveLength(5);
    expect(outcome.reports.every((report) => !("retention" in report))).toBe(
      true,
    );
    expect(outcome.encodings).toBe(0);
    expect(outcome.diagnostics).toEqual([]);
    expect(await fs.readdir(root)).toEqual([]);
  }, 20_000);
});
