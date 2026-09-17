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

const expectedAssets = {
  "JetBrainsMonoNerdFontMono-Regular.ttf":
    "f01031f40e48dc29e1112e6b0b0450a2c6cd097f3f35cfff05c55cb311f8034c",
  "OFL.txt": "30f0c136e3c88e422d0791acd97238870f9054a9729bc34cf2ff0d4ed8cac4ad",
} as const;

describe("Terminal appearance build", () => {
  it("owns the accepted OMXTerm application icon source byte-for-byte", async () => {
    const source = await readFile(applicationIconSource);
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "3c078dfc92467afa0ebb065aeaeb7c84f4442757d5ca831f028d16c39e9d8905",
    );
  });

  it("bundles only the accepted regular Nerd Font TTF and its OFL", async () => {
    await execute(process.execPath, ["build.mjs"], { cwd: projectRoot });

    expect((await readdir(fontDirectory)).sort()).toEqual([
      "JetBrainsMonoNerdFontMono-Regular.ttf",
      "OFL.txt",
      "README.md",
    ]);
    for (const [fileName, expectedHash] of Object.entries(expectedAssets)) {
      const source = await readFile(path.join(fontDirectory, fileName));
      expect(createHash("sha256").update(source).digest("hex")).toBe(
        expectedHash,
      );
    }

    const builtJavaScript = await readFile(
      path.join(projectRoot, "dist", "renderer", "index.js"),
      "utf8",
    );
    expect(builtJavaScript).toContain("JetBrainsMono Nerd Font Mono");
    expect(builtJavaScript).toContain("restty");
    expect(builtJavaScript).not.toContain("@xterm");
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
