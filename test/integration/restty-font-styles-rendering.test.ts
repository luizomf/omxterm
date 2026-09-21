import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { describe, it, expect } from "vitest";

interface Observation {
  phases: {
    name: string;
    hash?: string;
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

async function observe(mode: string): Promise<Observation> {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-font-styles-"));
  try {
    const runtime = await readFile(
      "node_modules/restty/dist/chunk-c0rcpsc5.js",
      "utf8",
    );
    expect(createHash("sha256").update(runtime).digest("hex")).toBe(
      "76f43defb727e77a09274bf54bdf1d2473ee41d218fb6aa59bbdc6b165fe22cc",
    );
    let probed = runtime;
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
  it("renders exact styles, preserves regular pixels and shares collection resources across live tabs", async () => {
    const regular = await observe("regular");
    const styled = await observe("styled");
    const partial = await observe("partial");
    const evidence = process.env.OMXTERM_FONT_STYLES_EVIDENCE_PATH;
    if (evidence)
      await writeFile(
        evidence,
        JSON.stringify({ regular, styled, partial }, null, 2) + "\n",
      );
    const capture = (run: Observation, name: string) =>
      run.phases.find((phase) => phase.name === name)!.hash;
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
