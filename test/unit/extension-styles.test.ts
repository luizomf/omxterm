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

it("keeps the Files checkbox caption and shortcut on separate shrinkable rows", async () => {
  const result = await build({
    entryPoints: ["extensions/files/files.css"],
    bundle: true,
    write: false,
  });
  const css = result.outputFiles[0]!.text;
  const rule = (selector: string) => {
    const start = css.indexOf(`\n${selector} {`);
    expect(start, selector).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf("}", start));
  };
  expect(rule(".file-menu")).toContain(
    "grid-template-columns: minmax(0, 1fr);",
  );
  expect(rule(".file-menu [role=menuitemcheckbox]")).toContain(
    "display: grid;",
  );
  expect(rule(".file-menu [role=menuitemcheckbox]")).toContain(
    "grid-template-columns: 1em minmax(0, 1fr);",
  );
  expect(rule(".menu-check")).toContain("grid-column: 1;");
  expect(rule(".menu-check")).toContain("grid-row: 1;");
  expect(rule(".menu-caption")).toContain("grid-column: 2;");
  expect(rule(".menu-caption")).toContain("grid-row: 1;");
  expect(rule(".menu-caption")).toContain("overflow-wrap: anywhere;");
  expect(rule(".menu-shortcut")).toContain("grid-column: 2;");
  expect(rule(".menu-shortcut")).toContain("grid-row: 2;");
  expect(rule(".menu-shortcut")).toContain("overflow-wrap: anywhere;");
  expect(rule(".menu-shortcut")).toContain("color: var(--ui-secondary);");
  expect(rule(".menu-shortcut")).not.toContain("white-space: nowrap;");
  expect(rule(".menu-with-shortcut .menu-shortcut")).toContain(
    "grid-column: 1;",
  );
  expect(rule(":focus-visible")).toContain(
    "outline: 2px solid var(--ui-text);",
  );
});

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
