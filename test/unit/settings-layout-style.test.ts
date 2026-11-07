import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { assertSettingsLayout } from "../fixtures/settings-layout-observation";
import { sample } from "../fixtures/settings-layout-sample";

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
  expect(css).toMatch(/\.settings-panel\s*\{[^}]*max-width:\s*880px;/u);
  expect(css).toMatch(/\.settings-row\s*\{[^}]*width:\s*100%;/u);
  expect(css).toMatch(
    /\.extensions-panel p,\s*\.extensions-panel \[role="status"\],\s*\.settings-config-file \[role="status"\]\s*\{[^}]*max-width:\s*72ch;/u,
  );
  expect(css).not.toMatch(
    /\.settings-config-file,\s*\.settings-shortcuts\s*\{[^}]*max-width:/u,
  );
  expect(css).toMatch(
    /@media \(max-height: 360px\)\s*\{[^]*?\.settings-body \.settings-tabs\s*\{[^}]*min-height:\s*min\(72px, 34vh\);/u,
  );
  expect(css).toMatch(
    /@media \(max-width: 639px\)\s*\{[^]*?\.settings-body\.application-page\.has-navigation\s*\{[^}]*grid-template-columns:\s*minmax\(120px, 168px\) minmax\(0, 1fr\)/u,
  );
});

it("rejects a theme row that stops before the shared grid edge", () => {
  const selected = "settings-panel-appearance";
  const observation = sample(1400, "columns", "inline", selected);
  expect(() => assertSettingsLayout(observation, selected)).not.toThrow();
  expect(() =>
    assertSettingsLayout(
      {
        ...observation,
        theme: {
          ...observation.theme!,
          cards: observation.theme!.cards.map((card, index) =>
            index === 5 ? { ...card, width: 40, right: 720 } : card,
          ),
        },
      },
      selected,
    ),
  ).toThrow("theme card row misses the grid edges");
});

it("rejects a narrow category even if the wide Shortcuts panel reaches the shared edge", () => {
  const selected = "settings-panel-extensions";
  const observation = {
    ...sample(1400, "columns", "inline", selected),
    width: 1920,
    height: 1080,
    navigation: { mode: "flex", reachable: true },
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
  expect(() =>
    assertSettingsLayout(
      {
        ...observation,
        extensions: {
          ...observation.extensions!,
          cards: [
            {
              ...observation.extensions!.cards[0]!,
              width: 720,
              right: 720,
            },
          ],
        },
      },
      selected,
    ),
  ).toThrow("Extension cards miss the shared content edge");
  expect(() =>
    assertSettingsLayout(
      { ...observation, navigation: { mode: "flex", reachable: false } },
      selected,
    ),
  ).toThrow("navigation tab is not scroll-reachable");
});
