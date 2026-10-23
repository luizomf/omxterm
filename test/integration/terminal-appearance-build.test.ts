import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const fontDirectory = path.join(projectRoot, "assets", "fonts");
const applicationIconSource = path.join(
  projectRoot,
  "assets",
  "application-icon.svg",
);
const scalableIconSource = path.join(
  projectRoot,
  "src/shared/icons/hicolor/scalable/apps/omxterm-hero.svg",
);

const expectedAssets = {
  "DejaVu-LICENSE.txt":
    "f88d5294af5a772f9114eb385009e3478d62b21f3e5bbc34d159d328047c8867",
  "DejaVuSansMono-Bold.ttf":
    "bce60f1b4421acd9ea51ba6623d7024ecbe6817a953e3654df62a5e6bdf8f769",
  "DejaVuSansMono.ttf":
    "b4a6c3e4faab8773f4ff761d56451646409f29abedd68f05d38c2df667d3c582",
  "FiraCode-OFL.txt":
    "1d41e10031ab125302780a05ec4c91d218e47db0c7e37cf315cce5e608cdc25c",
  "FiraCodeNerdFontMono-Bold.ttf":
    "7435c06ecc46dc975d2c356bf9bf1d8bc2226fdb1a877e6e9580193aae429519",
  "FiraCodeNerdFontMono-Regular.ttf":
    "53eebbaaa09c483ebb27fdd5cf21073cc4b760308e5d666728e9db2f41616c00",
  "JetBrainsMono-OFL.txt":
    "30f0c136e3c88e422d0791acd97238870f9054a9729bc34cf2ff0d4ed8cac4ad",
  "JetBrainsMonoNerdFontMono-Regular.ttf":
    "f01031f40e48dc29e1112e6b0b0450a2c6cd097f3f35cfff05c55cb311f8034c",
  "NerdFonts-glyphs.txt":
    "c67e7c17fa4fa1f894b8f4a1bb1ca4bbbce19cbea1eb80d5b0c400cf0e2ec332",
} as const;

describe("Terminal appearance build", () => {
  it("owns the accepted OMXTerm application icon source byte-for-byte", async () => {
    const source = await readFile(applicationIconSource);
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "7fc8183cc57f67152ae19c57ca53dc8ef2bb64c5136f8c60aa1c96e526c5463b",
    );
    // assets/ carries a copy of the scalable source the derivatives come from.
    expect(source.equals(await readFile(scalableIconSource))).toBe(true);
  });

  it("bundles the accepted regular and bold Terminal Font Stack assets", async () => {
    await execute(process.execPath, ["build.mjs"], { cwd: projectRoot });

    expect((await readdir(fontDirectory)).sort()).toEqual([
      ...Object.keys(expectedAssets).sort(),
      "README.md",
    ]);
    for (const [fileName, expectedHash] of Object.entries(expectedAssets)) {
      const source = await readFile(path.join(fontDirectory, fileName));
      expect(createHash("sha256").update(source).digest("hex")).toBe(
        expectedHash,
      );
    }

    const rendererJavaScript = await readFile(
      path.join(projectRoot, "dist", "renderer", "index.js"),
      "utf8",
    );
    expect(rendererJavaScript).toContain("FiraCode Nerd Font Mono");
    expect(rendererJavaScript).toContain("DejaVu Sans Mono");
    expect(rendererJavaScript).toContain("JetBrainsMono Nerd Font Mono");
    expect(rendererJavaScript).toContain("restty");
    expect(rendererJavaScript).not.toContain("@xterm");

    const mainJavaScript = await readFile(
      path.join(projectRoot, "dist", "main", "index.js"),
      "utf8",
    );
    expect(mainJavaScript).not.toMatch(/from ["']text-shaper["']/u);
  }, 30_000);

  it("places title inset and User Configuration padding on the Restty Surface", async () => {
    const css = await readFile(
      path.join(projectRoot, "src", "renderer", "terminal-window.css"),
      "utf8",
    );
    const resttyRule = css.match(
      /\.restty-terminal-surface\s*\{(?<body>[^}]*)\}/u,
    );
    expect(resttyRule?.groups?.body).toContain("display: flex");
    expect(resttyRule?.groups?.body).toContain(
      "var(--native-title-inset) + var(--terminal-padding-top, 0px)",
    );
    expect(resttyRule?.groups?.body).toContain(
      "var(--terminal-padding-right, 8px)",
    );
    expect(resttyRule?.groups?.body).toContain(
      "var(--terminal-padding-bottom, 8px)",
    );
    expect(resttyRule?.groups?.body).toContain(
      "var(--terminal-padding-left, 8px)",
    );
    expect(css).not.toContain(".xterm");
  });

  it("reserves only the visible title area for native window dragging", async () => {
    const css = await readFile(
      path.join(projectRoot, "src", "renderer", "terminal-window.css"),
      "utf8",
    );
    const surfaceRule = css.match(/\.terminal-surface\s*\{(?<body>[^}]*)\}/u);
    const titleAreaRule = css.match(
      /\.terminal-surface::before\s*\{(?<body>[^}]*)\}/u,
    );
    const resttyRule = css.match(
      /\.restty-terminal-surface\s*\{(?<body>[^}]*)\}/u,
    );

    expect(titleAreaRule?.groups?.body).toContain('content: ""');
    expect(titleAreaRule?.groups?.body).toContain("position: fixed");
    expect(titleAreaRule?.groups?.body).toContain(
      "height: var(--native-title-inset)",
    );
    expect(titleAreaRule?.groups?.body).toContain("app-region: drag");
    expect(surfaceRule?.groups?.body).not.toContain("app-region");
    expect(resttyRule?.groups?.body).not.toContain("app-region");
  });
});
