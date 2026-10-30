import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = (path: string) =>
  readFileSync(new URL(`../../src/renderer/${path}`, import.meta.url), "utf8");

it("keeps all Settings page layers clear without changing the layout", () => {
  const settings = css("settings/settings-dialog.css");
  for (const selector of [
    "settings-tab",
    "settings-dialog",
    "settings-body.application-page",
  ]) {
    const rule = settings.match(
      new RegExp(`\\.${selector.replaceAll(".", "\\.")} \\{([^}]+)\\}`),
    )?.[1];
    expect(rule).toContain("background: transparent;");
  }
  expect(settings).toContain("background: var(--ui-raised-tint)");
});

it.each(["about/about-dialog.css", "command-palette.css"])(
  "%s keeps theme alpha separate from readable text and keyboard focus",
  (path) => {
    const styles = css(path);
    expect(styles).toContain("background: var(--ui-overlay)");
    expect(styles).toContain("border: 1px solid var(--ui-decoration)");
    expect(styles).toMatch(/::backdrop\s*\{\s*background: transparent;/);
    expect(styles).toContain("outline: 2px solid var(--ui-text)");
    expect(styles).not.toMatch(/\bopacity\s*:/);
  },
);

it("filters existing application underlays only while the direct-child About is modal", () => {
  const styles = css("about/about-dialog.css");
  const underlays = styles.match(
    /body:has\(> \.about-dialog:modal\) > :not\(dialog, script, style, link\) \{([^}]+)\}/,
  )?.[1];
  expect(underlays).toContain("filter: blur(12px);");
  expect(styles.match(/\bfilter\s*:/g)).toHaveLength(1);
  expect(styles).not.toMatch(/backdrop-filter\s*:|\bopacity\s*:/);
  expect(styles).toMatch(/::backdrop\s*\{\s*background: transparent;\s*\}/);
});

it("derives overlay alpha from effective window paint without fading foreground", () => {
  const tokens = css("ui-tokens.css");
  expect(tokens).toContain(
    "from var(--ui-surface) r g b / var(--terminal-background-opacity, 1)",
  );
  expect(tokens).toContain("--ui-text: var(--terminal-foreground");
});
