import { expect, it } from "vitest";
import { build } from "esbuild";

it.each(["files", "ssh"])(
  "bundles %s styles with shared tokens and transparent base surfaces",
  async (name) => {
    const result = await build({
      entryPoints: [`extensions/${name}/${name}.css`],
      bundle: true,
      write: false,
    });
    const css = result.outputFiles[0]!.text;
    expect(css).not.toContain("@import");
    expect(css).toContain("--ui-surface:");
    expect(css).toContain("--tool-raised:");
    expect(css).toContain("background: transparent");
    // Keep the rendered narrow-panel correction in both packaged stylesheets.
    expect(css).toMatch(
      /\.application-page\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(css).not.toContain("#111923");
  },
);

it("bundles the Files toolbar pair and emphasized Actions glyph", async () => {
  const result = await build({
    entryPoints: ["extensions/files/files.css"],
    bundle: true,
    write: false,
  });
  const css = result.outputFiles[0]!.text;
  const pair = css.match(/\.toolbar-pair\s*\{([^}]*)\}/)?.[1];
  expect(pair).toContain("display: flex;");
  expect(pair).toContain("flex-wrap: wrap;");
  expect(pair).toContain("max-width: 100%;");
  expect(css).toMatch(
    /\.toolbar-button \.toolbar-icon-actions\s*\{\s*stroke-width: 2\.5;/,
  );
});
