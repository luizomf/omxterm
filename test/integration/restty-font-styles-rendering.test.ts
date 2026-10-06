import { copyFile, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { describe, it, expect } from "vitest";
import { syntheticBoldCorrections } from "../../scripts/restty-synthetic-bold-corrections.mjs";
import { supportedFixtureChromiumArguments } from "../fixtures/supported-fixture-chromium-arguments";
import {
  createFontStyleEvidence,
  type FontStyleVariant,
} from "../fixtures/restty-font-style-evidence";

interface Observation {
  phases: {
    name: string;
    hash?: string;
    ink?: {
      width: number;
      height: number;
      coverage: number;
      centerColumnInk: number;
    };
    outsideGrowth?: number;
    store: { sources: number; parsed: number; leases: number; bytes: number };
  }[];
  result: {
    error?: string;
    requests: number;
    picks: Record<string, number>;
    replies: string[];
  };
}
const electron = createRequire(import.meta.url)("electron") as string;
const family =
  process.platform === "darwin"
    ? "Menlo"
    : process.platform === "win32"
      ? "Consolas"
      : "DejaVu Sans Mono";

async function observe(
  mode: string,
  priorSynthesis = false,
  capture?: { directory: string; variant: FontStyleVariant },
): Promise<Observation> {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-font-styles-"));
  try {
    const runtime = await readFile(
      "node_modules/restty/dist/chunk-c0rcpsc5.js",
      "utf8",
    );
    expect(createHash("sha256").update(runtime).digest("hex")).toBe(
      "8ebccc2aa81d37266bbf4642e3e07e8c0b17e39935a97d8c3703eb9ac5e72649",
    );
    let probed = runtime;
    if (priorSynthesis) {
      for (const { original, corrected } of syntheticBoldCorrections) {
        expect(probed.split(corrected)).toHaveLength(2);
        probed = probed.replace(corrected, original);
      }
      expect(createHash("sha256").update(probed).digest("hex")).toBe(
        "e45b848b0edea99ac8a501f6347c6fff35cdd9af4a9d47b8d245b6d3722e54c1",
      );
    }
    const synthesisRuntimeSha256 = capture
      ? createHash("sha256").update(probed).digest("hex")
      : undefined;
    const replace = (needle: string, replacement: string) => {
      expect(probed.split(needle)).toHaveLength(2);
      probed = probed.replace(needle, replacement);
    };
    replace(
      "let nextLeaseId = 1;",
      "let nextLeaseId = 1; globalThis.fontStyleStoreStats = () => ({sources:sourceCache.size, parsed:parsedCache.size, leases:leaseSources.size, bytes:totalCachedSourceBytes});",
    );
    replace(
      "const firstIndex = pickWithStyle();",
      "const firstIndex = pickWithStyle(); globalThis.fontStylePicks[stylePreference + ':' + (fontState.fonts[firstIndex]?.label ?? 'missing')] = 1;",
    );
    await build({
      entryPoints: ["test/fixtures/restty-font-styles-main.ts"],
      bundle: true,
      format: "cjs",
      platform: "node",
      external: ["electron"],
      outfile: path.join(root, "main.cjs"),
    });
    await build({
      entryPoints: ["test/fixtures/restty-font-styles-renderer.ts"],
      bundle: true,
      format: "iife",
      platform: "browser",
      loader: { ".ttf": "binary" },
      outfile: path.join(root, "renderer.js"),
      plugins: [
        {
          name: "style-selection-probe",
          setup(builder) {
            builder.onLoad({ filter: /chunk-c0rcpsc5\.js$/ }, () => ({
              loader: "js",
              contents: "globalThis.fontStylePicks = {};\n" + probed,
            }));
          },
        },
      ],
    });
    await writeFile(
      path.join(root, "preload.cjs"),
      `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fontStyleProbe',{fonts:()=>ipcRenderer.invoke('fonts'),phase:(name,capture,store,cell)=>ipcRenderer.invoke('phase',name,capture,store,cell),report:result=>ipcRenderer.send('report',result)});`,
    );
    const policy = (await readFile("src/renderer/index.html", "utf8")).match(
      /content="([^"]+)"/u,
    )![1];
    // The production host constrains CSS geometry independently of the DPR-
    // scaled canvas buffer, including when touch-capable hosts omit its wrapper.
    await copyFile(
      "src/renderer/terminal-window.css",
      path.join(root, "renderer.css"),
    );
    await writeFile(
      path.join(root, "index.html"),
      `<!doctype html><html style="--native-title-inset:0px"><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="renderer.css"></head><body data-family="${family}" style="margin:0;background:#101014"><script src="renderer.js"></script></body></html>`,
    );
    const fileSha256 = async (file: string) =>
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex");
    const captureMetadata = capture
      ? {
          variant: capture.variant,
          provenance: {
            preparedRuntimeSha256: createHash("sha256")
              .update(runtime)
              .digest("hex"),
            synthesisRuntimeSha256,
            instrumentedRuntimeSha256: createHash("sha256")
              .update(probed)
              .digest("hex"),
            testSourceSha256: await fileSha256(
              "test/integration/restty-font-styles-rendering.test.ts",
            ),
            mainSourceSha256: await fileSha256(
              "test/fixtures/restty-font-styles-main.ts",
            ),
            rendererSourceSha256: await fileSha256(
              "test/fixtures/restty-font-styles-renderer.ts",
            ),
            evidenceSourceSha256: await fileSha256(
              "test/fixtures/restty-font-style-evidence.ts",
            ),
            mainBundleSha256: await fileSha256(path.join(root, "main.cjs")),
            rendererBundleSha256: await fileSha256(
              path.join(root, "renderer.js"),
            ),
          },
        }
      : undefined;
    const { stdout } = await promisify(execFile)(
      electron,
      [
        path.join(root, "main.cjs"),
        root,
        mode,
        family,
        // Apply Linux policy before Electron bootstrap without shifting the
        // fixture's positional application arguments.
        ...supportedFixtureChromiumArguments(),
      ],
      {
        timeout: 75_000,
        maxBuffer: 2_000_000,
        env: {
          ...process.env,
          // These child-only values cannot enable captures in other observations.
          OMXTERM_FONT_STYLES_CAPTURE_DIRECTORY: capture?.directory ?? "",
          OMXTERM_FONT_STYLES_CAPTURE_METADATA: captureMetadata
            ? JSON.stringify(captureMetadata)
            : "",
          XDG_CONFIG_HOME: path.join(root, "config"),
          XDG_STATE_HOME: path.join(root, "state"),
        },
      },
    );
    const result = JSON.parse(stdout.trim().split("\n").at(-1)!) as Observation;
    expect(result.result.error).toBeUndefined();
    return result;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("native configured font styles", () => {
  it("emboldens horizontal as well as vertical strokes when real bold is unavailable", async () => {
    const run = await observe("italicOnly");
    const regular = run.phases.find((phase) => phase.name === "regular")!.ink!;
    const bold = run.phases.find((phase) => phase.name === "bold")!.ink!;
    expect(regular.height).toBeGreaterThan(0);
    expect(bold.height).toBeGreaterThan(regular.height);
    expect(bold.width).toBeGreaterThan(regular.width);
    expect(bold.coverage).toBeGreaterThan(regular.coverage);
    const italic = run.phases.find((phase) => phase.name === "italic")!.ink!;
    const boldItalic = run.phases.find(
      (phase) => phase.name === "boldItalic",
    )!.ink!;
    expect(boldItalic.height).toBeGreaterThan(italic.height);
    expect(boldItalic.coverage).toBeGreaterThan(italic.coverage);
  }, 75_000);

  it("renders exact styles, preserves regular pixels and shares collection resources across live tabs", async ({
    onTestFinished,
  }) => {
    const evidence = await createFontStyleEvidence(
      process.env.OMXTERM_FONT_STYLES_EVIDENCE_PATH,
    );
    if (evidence) onTestFinished(() => evidence.close());
    const regular = await observe(
      "regular",
      false,
      evidence
        ? {
            directory: path.join(evidence.directory, "current-regular"),
            variant: "current-regular",
          }
        : undefined,
    );
    const wideBoldItalic = regular.phases.find(
      (phase) => phase.name === "wideBoldItalic",
    )!;
    const wideItalic = regular.phases.find(
      (phase) => phase.name === "wideItalic",
    )!;
    expect(wideBoldItalic.ink!.coverage).toBeGreaterThan(
      wideItalic.ink!.coverage,
    );
    expect(wideBoldItalic.outsideGrowth).toBe(0);
    const styled = await observe("styled");
    const partial = await observe("partial");
    const priorStyled = await observe("styled", true);
    const priorRegular = await observe(
      "regular",
      true,
      evidence
        ? {
            directory: path.join(evidence.directory, "prior-regular"),
            variant: "prior-regular",
          }
        : undefined,
    );
    if (evidence)
      await evidence.write({
        regular,
        styled,
        partial,
        priorStyled,
        priorRegular,
      });
    const capture = (run: Observation, name: string) =>
      run.phases.find((phase) => phase.name === name)!.hash;
    for (const style of ["regular", "bold", "italic", "boldItalic"])
      expect(capture(styled, style)).toBe(capture(priorStyled, style));
    for (const style of ["regular", "italic"])
      expect(capture(regular, style)).toBe(capture(priorRegular, style));
    for (const style of ["bold", "boldItalic"]) {
      const currentInk = regular.phases.find(
        (phase) => phase.name === style,
      )!.ink!;
      const priorInk = priorRegular.phases.find(
        (phase) => phase.name === style,
      )!.ink!;
      expect(currentInk.coverage).toBeGreaterThan(priorInk.coverage);
    }
    // At DPR1, horizontal duplication can already darken faint outer pixels
    // past the ink threshold without adding vertical stroke thickness. Measure
    // the isolated H crossbar instead of requiring whole-text bounds to grow.
    const stroke = regular.phases.find(
      (phase) => phase.name === "strokeBold",
    )!.ink!;
    const priorStroke = priorRegular.phases.find(
      (phase) => phase.name === "strokeBold",
    )!.ink!;
    expect(stroke.centerColumnInk).toBeGreaterThan(priorStroke.centerColumnInk);
    expect(regular.result.replies).toEqual(priorRegular.result.replies);
    expect(capture(styled, "regular")).toBe(capture(regular, "regular"));
    for (const style of ["bold", "italic", "boldItalic"])
      expect(capture(styled, style)).not.toBe(capture(regular, style));
    expect(capture(partial, "bold")).toBe(capture(regular, "bold"));
    expect(capture(partial, "italic")).toBe(capture(regular, "italic"));
    expect(capture(partial, "boldItalic")).toBe(capture(styled, "boldItalic"));
    expect(styled.result.replies).toEqual(regular.result.replies);
    if (process.platform === "darwin") {
      // Menlo's styles are collection members: preload transport must not turn
      // their shared bytes into four independent Restty source/parsed keys.
      expect(styled.phases[0]!.store).toEqual(regular.phases[0]!.store);
    }
    for (const run of [regular, styled, partial]) {
      expect(run.result.requests).toBe(1);
      const one = run.phases.find(
        (phase) => phase.name === "one-startup",
      )!.store;
      const three = run.phases.find(
        (phase) => phase.name === "three-live",
      )!.store;
      expect(three).toEqual({ ...one, leases: 3 });
      expect(
        run.phases.find((phase) => phase.name === "back-to-one")!.store.leases,
      ).toBe(1);
      expect(
        run.phases.find((phase) => phase.name === "disposed")!.store.leases,
      ).toBe(0);
    }
  }, 120_000);
});
