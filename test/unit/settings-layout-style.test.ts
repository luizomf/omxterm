import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  assertSettingsLayout,
  type SettingsLayoutObservation,
} from "../fixtures/settings-layout-observation";

it("uses only the content query container and viewport queries for outer Settings layout", () => {
  const css =
    readFileSync("src/renderer/settings/settings-dialog.css", "utf8") +
    readFileSync("src/renderer/application-page.css", "utf8");
  const declarations = [
    ...css.matchAll(/([^{}]+)\{([^{}]*container-type:[^{}]*)\}/gu),
  ];
  expect(declarations.map((match) => match[1]!.trim())).toEqual([
    ".application-page-content",
  ]);
  for (const edge of [
    "min-width: 900px",
    "min-width: 1200px",
    "max-width: 639px",
  ])
    expect(css).toContain(`@media (${edge})`);
  for (const edge of [560, 760])
    expect(css).toContain(`@container (min-width: ${edge}px)`);
});

it("shares the wide panel cap and keeps compact desktop navigation vertical", () => {
  const css = readFileSync("src/renderer/settings/settings-dialog.css", "utf8");
  expect(css).toMatch(/\.settings-panel\s*\{[^}]*max-width:\s*1120px;/u);
  expect(css).not.toMatch(
    /\.settings-config-file,\s*\.settings-shortcuts\s*\{[^}]*max-width:/u,
  );
  expect(css).toMatch(
    /@media \(max-width: 639px\)\s*\{[^]*?\.settings-body\.application-page\.has-navigation\s*\{[^}]*grid-template-columns:\s*minmax\(120px, 168px\) minmax\(0, 1fr\)/u,
  );
});

it("rejects a narrow category even if the wide Shortcuts panel reaches the shared edge", () => {
  const selected = "settings-panel-extensions";
  const ids = [
    "general",
    "appearance",
    "terminal",
    "window",
    "shortcuts",
    "config-file",
    "extensions",
  ].map((id) => `settings-panel-${id}`);
  const observation: SettingsLayoutObservation = {
    panels: ids.map((id) => ({
      id,
      hidden: id !== selected,
      display: id === selected ? "flex" : "none",
      box: {
        left: 0,
        top: 0,
        right: id === selected ? 1120 : 0,
        bottom: id === selected ? 160 : 0,
        width: id === selected ? 1120 : 0,
        height: id === selected ? 160 : 0,
      },
    })),
    categories: ids.map((panel) => ({ panel, selected: panel === selected })),
    contentWidth: 1400,
    forms: [],
    labels: [],
    shortcuts: [],
    overflow: false,
    focus: true,
    scheme: "dark",
    width: 1920,
    height: 1080,
  };
  expect(() => assertSettingsLayout(observation, selected)).not.toThrow();
  expect(() =>
    assertSettingsLayout(
      {
        ...observation,
        panels: observation.panels.map((panel) =>
          panel.hidden
            ? panel
            : { ...panel, box: { ...panel.box, width: 720, right: 720 } },
        ),
      },
      selected,
    ),
  ).toThrow("do not share a content boundary");
});
