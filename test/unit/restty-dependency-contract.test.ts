import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareResttyRuntime } from "../../scripts/prepare-restty-runtime.mjs";

const require = createRequire(import.meta.url);
const packageRoot = path.dirname(path.dirname(require.resolve("restty")));
const packagePath = path.join(packageRoot, "package.json");
const digest = (source: Buffer) =>
  createHash("sha256").update(source).digest("hex");

describe("Restty dependency contract", () => {
  it("pins Restty and its shaping input to the reviewed versions", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.resolve(import.meta.dirname, "../..", "package.json"),
        "utf8",
      ),
    ) as { dependencies: Record<string, string> };
    const restty = JSON.parse(readFileSync(packagePath, "utf8")) as {
      version: string;
      dependencies: Record<string, string>;
    };

    expect(manifest.dependencies.restty).toBe("0.3.0");
    expect(restty.version).toBe("0.3.0");
    expect(restty.dependencies["text-shaper"]).toBe("0.1.28");
  });

  it("maps locked npm bytes to exact source and submodule commits", () => {
    const projectRoot = path.resolve(import.meta.dirname, "../..");
    const lock = JSON.parse(
      readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"),
    ) as {
      packages: Record<
        string,
        { version?: string; resolved?: string; integrity?: string }
      >;
    };
    const sources = JSON.parse(
      readFileSync(
        path.join(projectRoot, "assets", "restty-sources.json"),
        "utf8",
      ),
    ) as {
      restty: {
        version: string;
        npm: { gitHead: string; integrity: string };
        source: {
          commit: string;
          tree: string;
          ghosttySubmodule: string;
          textShaperSubmodule: string;
        };
      };
      omxtermCore: {
        sourceCommit: string;
        ghosttyCommit: string;
        patches: ReadonlyArray<{
          repository: "restty" | "ghostty";
          path: string;
          sha256: string;
        }>;
        artifact: string;
        artifactSha256: string;
        zigVersion: string;
        optimize: string;
        target: string;
        cpu: string;
      };
      textShaper: {
        version: string;
        npm: { gitHead: string; integrity: string };
      };
    };

    expect(lock.packages["node_modules/restty"]).toMatchObject({
      version: sources.restty.version,
      integrity: sources.restty.npm.integrity,
    });
    expect(lock.packages["node_modules/text-shaper"]).toMatchObject({
      version: sources.textShaper.version,
      integrity: sources.textShaper.npm.integrity,
    });
    expect(sources.restty.npm.gitHead).toBe(sources.restty.source.commit);
    expect(sources.restty.source).toEqual({
      commit: "3db45b0e10dbe53c52a77131d366f519546e4f04",
      tree: "e0aea43f2afc5c98aa377fee8c2dae6a897d4aeb",
      ghosttySubmodule: "0309af1b7f0724105a0805efa88bbee808a616ae",
      textShaperSubmodule: "94db4fba9186b99b868b401ce404a9930b93fcbf",
    });
    expect(sources.textShaper.npm.gitHead).toBe(
      "a23058f475f2b0655b93a89bfce426eecafb9439",
    );
    expect(sources.omxtermCore).toMatchObject({
      sourceCommit: sources.restty.source.commit,
      ghosttyCommit: sources.restty.source.ghosttySubmodule,
      zigVersion: "0.16.0",
      optimize: "ReleaseSafe",
      target: "wasm32-freestanding",
      cpu: "baseline+simd128",
    });
    expect(
      sources.omxtermCore.patches.map(({ repository }) => repository),
    ).toEqual(["restty", "ghostty"]);
    for (const patch of sources.omxtermCore.patches)
      expect(digest(readFileSync(path.join(projectRoot, patch.path)))).toBe(
        patch.sha256,
      );
    expect(
      digest(
        readFileSync(path.join(projectRoot, sources.omxtermCore.artifact)),
      ),
    ).toBe(sources.omxtermCore.artifactSha256);
  });

  it("keeps the installed runtime at the reviewed corrected digest", async () => {
    await prepareResttyRuntime();
    await prepareResttyRuntime();

    const runtime = readFileSync(
      path.join(packageRoot, "dist", "chunk-c0rcpsc5.js"),
    );
    expect(digest(runtime)).toBe(
      "3b1076d32880f0f28b8cbb465687825c4bb980d34d1af67862e23b5eda2871e3",
    );
    const core = readFileSync(
      path.join(packageRoot, "dist", "chunk-6dxqza9q.js"),
    );
    expect(digest(core)).toBe(
      "1fb03cc8360942c613ca98973658de362852a60d88942c482de4b0dc429660fa",
    );
    expect(core.toString("utf8")).toContain("restty_set_scrollback_limits");
    expect(core.toString("utf8")).toContain("restty_event_consume");
    expect(core.toString("utf8")).toContain("restty_debug_kitty_total_limit");
    expect(core.toString("utf8")).toContain("ignoreBOM: true");
    const source = runtime.toString("utf8");
    expect(source).toContain("Math.max(1, Math.round(value))");
    expect(source).toContain("lineHeight * fontConfig.lineHeightFactor");
    expect(source).toContain("const BOLD_BRIGHTEN = 0;");
    expect(source).toContain(
      "collectionFaces.filter((face) => face.family === source.label)",
    );
    expect(source).toContain("/^(regular|book|roman)$/iu");
    expect(source).toContain("required font decode failed");
    expect(source).toContain("setScrollbackLines");
    expect(source).toContain("const scrollTopBeforeSpacer = host.scrollTop;");
    expect(source).toContain(
      "if (host.scrollTop !== scrollTopBeforeSpacer) ignoreNextScroll = true;",
    );
    expect(source).toContain("setScrollbackLimits");
    expect(source).toContain("setOptionKeyMode");
    expect(source).toContain("getOptionKeyMode");
    expect(source).toContain("isNativeOptionText");
    expect(source).toContain("baseKey.toUpperCase()");
    expect(source).toContain('event.key === "Dead"');
    expect(source).not.toContain("const wantsCopy =");
    expect(source).not.toContain("const wantsPaste =");
    expect(source).toContain('seq.startsWith("\\x1B[>")');
    expect(source).toContain('runBeforeInputHook(text, "paste")');
    expect(source).toContain("isBracketedPasteEnabled");
    expect(source).toContain("getSelectionText");
    expect(source).toContain("selectAll");
    expect(source).toContain("getVisibleLinkAtClientPoint");
    expect(source).toContain("Snapshot every cell before");
    expect(source).toContain("resolveVisibleLink: services.resolveVisibleLink");
    expect(source).toContain("setVisibleLinkHover");
    expect(source).toContain("visibleHoverCells.has(idx)");
    expect(source).toContain("const cells = []");
    expect(source).toContain("row: -viewportOffset");
    expect(source).toContain("totalRows - viewportOffset - 1");
    expect(source).toContain("onOsc: services.onOsc");
    expect(source).toContain("code === 24 || code === 26");
    expect(source).toContain("drainParsedEvents");
    expect(source).toContain("options.emitRuntimeEvent(event)");
    expect(source).toContain("MAX_RETAINED_CONTROL_CODE_UNITS = 1e7");
    expect(source).toContain('this.discardedControl = "osc"');
    expect(source).toContain('this.discardedControl = "csi"');
    expect(source).toContain("code === 24 || code === 26");
    const eventTypes = readFileSync(
      path.join(packageRoot, "dist", "runtime/core/runtime-events.d.ts"),
      "utf8",
    );
    expect(digest(Buffer.from(eventTypes))).toBe(
      "428304b91fffa494abcda7e2ac96fc4d305db9906b1436f07650969840a2fa34",
    );
    expect(eventTypes).toContain('type: "title"');
    expect(eventTypes).toContain('type: "bell"');
    expect(source).not.toContain(
      "Math.max(10, Math.min(64, Math.round(value)))",
    );
  });

  it("rejects runtime, embedded-core, event-type, and artifact drift", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-restty-drift-"));
    try {
      const runtimePath = path.join(root, "runtime.js");
      const corePath = path.join(root, "core.js");
      const artifactPath = path.join(root, "core.wasm");
      const eventTypesPath = path.join(root, "runtime-events.d.ts");
      const installedRuntime = path.join(
        packageRoot,
        "dist",
        "chunk-c0rcpsc5.js",
      );
      const installedCore = path.join(packageRoot, "dist", "chunk-6dxqza9q.js");
      const installedEventTypes = path.join(
        packageRoot,
        "dist",
        "runtime/core/runtime-events.d.ts",
      );
      const trackedCore = path.resolve(
        import.meta.dirname,
        "../../assets/restty/omxterm-restty-core.wasm",
      );
      await Promise.all([
        copyFile(installedRuntime, runtimePath),
        copyFile(installedCore, corePath),
        copyFile(installedEventTypes, eventTypesPath),
        copyFile(trackedCore, artifactPath),
      ]);
      const options = {
        runtimePath,
        corePath,
        correctedCorePath: artifactPath,
        eventTypesPath,
      };

      await writeFile(runtimePath, `${readFileSync(runtimePath, "utf8")}\n`);
      await expect(prepareResttyRuntime(options)).rejects.toThrow(
        /Unrecognized Restty runtime/u,
      );

      await copyFile(installedRuntime, runtimePath);
      const driftedCore = `${readFileSync(corePath, "utf8")}\n`;
      await writeFile(corePath, driftedCore);
      await expect(prepareResttyRuntime(options)).rejects.toThrow(
        /Unrecognized Restty WASM runtime/u,
      );
      expect(readFileSync(corePath, "utf8")).toBe(driftedCore);

      await copyFile(installedCore, corePath);
      await writeFile(artifactPath, Buffer.from([0, 97, 115, 109]));
      await expect(prepareResttyRuntime(options)).rejects.toThrow(
        /artifact failed its checksum/u,
      );

      await copyFile(trackedCore, artifactPath);
      await writeFile(eventTypesPath, "export type Drift = true;\n");
      await expect(prepareResttyRuntime(options)).rejects.toThrow(
        /Unrecognized Restty event types/u,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
