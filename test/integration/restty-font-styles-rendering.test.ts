import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { describe, it, expect } from "vitest";
import { syntheticBoldCorrections } from "../../scripts/restty-synthetic-bold-corrections.mjs";

interface Observation {
  phases: {
    name: string;
    hash?: string;
    ink?: { height: number; coverage: number };
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
): Promise<Observation> {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-font-styles-"));
  try {
    const runtime = await readFile(
      "node_modules/restty/dist/chunk-c0rcpsc5.js",
      "utf8",
    );
    expect(createHash("sha256").update(runtime).digest("hex")).toBe(
      "04e13441b65cb33bfd70823f5ff36df6729a332950024c90fddb8f642c68ba47",
    );
    let probed = runtime;
    if (priorSynthesis) {
      for (const { original, corrected } of syntheticBoldCorrections) {
        expect(probed.split(corrected)).toHaveLength(2);
        probed = probed.replace(corrected, original);
      }
      expect(createHash("sha256").update(probed).digest("hex")).toBe(
        "76f43defb727e77a09274bf54bdf1d2473ee41d218fb6aa59bbdc6b165fe22cc",
      );
    }
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
      `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fontStyleProbe',{fonts:()=>ipcRenderer.invoke('fonts'),phase:(name,capture,store)=>ipcRenderer.invoke('phase',name,capture,store),report:result=>ipcRenderer.send('report',result)});`,
    );
    const policy = (await readFile("src/renderer/index.html", "utf8")).match(
      /content="([^"]+)"/u,
    )![1];
    await writeFile(
      path.join(root, "index.html"),
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body data-family="${family}" style="margin:0;background:#101014"><script src="renderer.js"></script></body></html>`,
    );
    const { stdout } = await promisify(execFile)(
      electron,
      [path.join(root, "main.cjs"), root, mode, family],
      {
        timeout: 75_000,
        maxBuffer: 2_000_000,
        env: {
          ...process.env,
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
    expect(bold.coverage).toBeGreaterThan(regular.coverage);
    const italic = run.phases.find((phase) => phase.name === "italic")!.ink!;
    const boldItalic = run.phases.find(
      (phase) => phase.name === "boldItalic",
    )!.ink!;
    expect(boldItalic.height).toBeGreaterThan(italic.height);
    expect(boldItalic.coverage).toBeGreaterThan(italic.coverage);
  }, 75_000);

  it("renders exact styles, preserves regular pixels and shares collection resources across live tabs", async () => {
    const regular = await observe("regular");
    const styled = await observe("styled");
    const partial = await observe("partial");
    const priorStyled = await observe("styled", true);
    const priorRegular = await observe("regular", true);
    const evidence = process.env.OMXTERM_FONT_STYLES_EVIDENCE_PATH;
    if (evidence)
      await writeFile(
        evidence,
        JSON.stringify(
          { regular, styled, partial, priorStyled, priorRegular },
          null,
          2,
        ) + "\n",
      );
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
      expect(currentInk.height).toBeGreaterThan(priorInk.height);
      expect(currentInk.coverage).toBeGreaterThan(priorInk.coverage);
    }
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
