import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
  });

  it("keeps the installed runtime at the reviewed corrected digest", async () => {
    await prepareResttyRuntime();
    await prepareResttyRuntime();

    const runtime = readFileSync(
      path.join(packageRoot, "dist", "chunk-c0rcpsc5.js"),
    );
    expect(digest(runtime)).toBe(
      "a0cd79e08164bde293ca4ee6b52ab1b71cc8959eb1da646f95dde52015aad270",
    );
    const source = runtime.toString("utf8");
    expect(source).toContain("Math.max(1, Math.round(value))");
    expect(source).toContain("lineHeight * fontConfig.lineHeightFactor");
    expect(source).toContain("const BOLD_BRIGHTEN = 0;");
    expect(source).not.toContain(
      "Math.max(10, Math.min(64, Math.round(value)))",
    );
  });
});
