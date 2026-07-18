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
const outputFontDirectory = path.join(projectRoot, "dist", "renderer", "fonts");
const applicationIconSource = path.join(
  projectRoot,
  "assets",
  "application-icon.svg",
);

const expectedAssets = {
  "JetBrainsMonoNerdFontMono-Regular.woff2":
    "50680a64466fbcc3eff68e00f84505f55681c86f8450c042416af5a8dbc1cce1",
  "OFL.txt": "30f0c136e3c88e422d0791acd97238870f9054a9729bc34cf2ff0d4ed8cac4ad",
} as const;

describe("Terminal appearance build", () => {
  it("owns the accepted OMXTerm application icon source byte-for-byte", async () => {
    const source = await readFile(applicationIconSource);

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "3c078dfc92467afa0ebb065aeaeb7c84f4442757d5ca831f028d16c39e9d8905",
    );
  });

  it("ships the accepted regular Nerd Font and OFL without another font weight", async () => {
    await execute(process.execPath, ["build.mjs"], { cwd: projectRoot });

    expect((await readdir(fontDirectory)).sort()).toEqual([
      "JetBrainsMonoNerdFontMono-Regular.woff2",
      "OFL.txt",
      "README.md",
    ]);

    for (const [fileName, expectedHash] of Object.entries(expectedAssets)) {
      const source = await readFile(path.join(fontDirectory, fileName));
      const output = await readFile(path.join(outputFontDirectory, fileName));
      expect(createHash("sha256").update(source).digest("hex")).toBe(
        expectedHash,
      );
      expect(createHash("sha256").update(output).digest("hex")).toBe(
        expectedHash,
      );
    }

    const css = await readFile(
      path.join(projectRoot, "dist", "renderer", "index.css"),
      "utf8",
    );
    expect(css).toContain("JetBrainsMonoNerdFontMono-Regular.woff2");
    expect(css).toContain("JetBrainsMono Nerd Font Mono");
    expect(css).toContain("app-region: drag");
    expect(css).not.toContain("JetBrainsMonoNerdFontMono-Bold");
  }, 30_000);

  it("places the title-area inset on xterm so fitting excludes it from the grid", async () => {
    const css = await readFile(
      path.join(projectRoot, "src", "renderer", "terminal-window.css"),
      "utf8",
    );
    const surfaceRule = css.match(/#terminal-surface\s*\{(?<body>[^}]*)\}/u);
    const xtermRule = css.match(
      /#terminal-surface \.xterm\s*\{(?<body>[^}]*)\}/u,
    );

    expect(surfaceRule?.groups?.body).not.toContain("padding");
    expect(surfaceRule?.groups?.body).toContain(
      "background: var(--terminal-background, transparent)",
    );
    expect(xtermRule?.groups?.body).toContain("box-sizing: border-box");
    expect(xtermRule?.groups?.body).toContain("width: 100%");
    expect(xtermRule?.groups?.body).toContain("height: 100%");
    expect(xtermRule?.groups?.body).toContain(
      "padding: calc(30px + var(--terminal-padding-top, 0px))",
    );
    expect(xtermRule?.groups?.body).toContain(
      "var(--terminal-padding-right, 8px)",
    );
    expect(xtermRule?.groups?.body).toContain(
      "var(--terminal-padding-bottom, 8px)",
    );
    expect(xtermRule?.groups?.body).toContain(
      "var(--terminal-padding-left, 8px)",
    );
  });

  it("reserves only the visible title area for native window dragging", async () => {
    const css = await readFile(
      path.join(projectRoot, "src", "renderer", "terminal-window.css"),
      "utf8",
    );
    const surfaceRule = css.match(/#terminal-surface\s*\{(?<body>[^}]*)\}/u);
    const titleAreaRule = css.match(
      /#terminal-surface::before\s*\{(?<body>[^}]*)\}/u,
    );
    const xtermRule = css.match(
      /#terminal-surface \.xterm\s*\{(?<body>[^}]*)\}/u,
    );

    expect(titleAreaRule?.groups?.body).toContain('content: ""');
    expect(titleAreaRule?.groups?.body).toContain("position: fixed");
    expect(titleAreaRule?.groups?.body).toContain("height: 30px");
    expect(titleAreaRule?.groups?.body).toContain("app-region: drag");
    expect(surfaceRule?.groups?.body).not.toContain("app-region");
    expect(xtermRule?.groups?.body).not.toContain("app-region");
  });
});
