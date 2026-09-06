// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSnippetsSidebar } from "../../src/renderer/snippets-sidebar";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

// Regression for #96: xterm 6 keeps an empty companion viewport whose stock
// overflow-y: scroll paints a permanent disabled scrollbar track on platforms
// with classic scrollbars. The Terminal Window stylesheet must win the cascade
// against the bundled xterm stylesheet for all viewport styling.
const terminalWindowCss = readFileSync(
  "src/renderer/terminal-window.css",
  "utf8",
);

describe("Terminal Window viewport", () => {
  it("hides the scrollbar and applies the active Terminal Theme background", () => {
    const terminalThemeBackground = "#1e1e2e";
    for (const stylesheet of [
      "node_modules/@xterm/xterm/css/xterm.css",
      "src/renderer/terminal-window.css",
    ]) {
      const style = document.createElement("style");
      const source =
        stylesheet === "src/renderer/terminal-window.css"
          ? terminalWindowCss
          : readFileSync(stylesheet, "utf8");
      // jsdom preserves var() in computed colors, so resolve the representative
      // active theme value before exercising the real stylesheet cascade.
      style.textContent = source.replaceAll(
        "var(--terminal-background, transparent)",
        terminalThemeBackground,
      );
      document.head.append(style);
    }
    const surface = document.createElement("div");
    surface.className = "terminal-surface";
    const xterm = document.createElement("div");
    xterm.className = "xterm";
    const viewport = document.createElement("div");
    viewport.className = "xterm-viewport";
    xterm.append(viewport);
    surface.append(xterm);
    document.body.append(surface);

    expect(getComputedStyle(viewport).overflowY).toBe("hidden");
    expect(getComputedStyle(viewport).backgroundColor).toBe("rgb(30, 30, 46)");
  });
});

describe("Terminal font rendering", () => {
  it("requests thinner macOS smoothing only for terminal glyphs", () => {
    expect(
      declaration(
        ruleBody(".terminal-surface .xterm"),
        "-webkit-font-smoothing",
      ),
    ).toBe("antialiased");
    expect(ruleBody("html,\nbody")).not.toContain("font-smoothing");
    expect(terminalWindowCss).not.toContain("-moz-osx-font-smoothing");
    expect(terminalWindowCss).not.toContain("text-rendering");
  });
});

describe("Terminal Tab theme", () => {
  it("uses the cool chrome neutral without tinting text", () => {
    expect(declaration(ruleBody("#tab-strip button"), "color")).toContain(
      "--terminal-foreground",
    );

    for (const selector of [
      "#tab-strip button",
      "#tab-strip button:hover",
      '#tab-strip button[aria-selected="true"]',
    ]) {
      const background = declaration(ruleBody(selector), "background");
      expect(background).toContain("--terminal-chrome-neutral");
      expect(background).not.toContain("--terminal-foreground");
    }
  });

  it.each([
    ["light", "#f5f5f5", "#161616"],
    ["dark", "#000000", "#f0f0ff"],
  ])(
    "keeps text and tab states visible with a representative %s theme",
    (_name, backgroundHex, foregroundHex) => {
      const background = hexColor(backgroundHex);
      const foreground = hexColor(foregroundHex);
      const chromeNeutral = hexColor("#808090");
      const tab = mix(
        background,
        chromeNeutral,
        chromeNeutralMix(
          declaration(ruleBody("#tab-strip button"), "background"),
        ),
      );
      const hover = mix(
        background,
        chromeNeutral,
        chromeNeutralMix(
          declaration(ruleBody("#tab-strip button:hover"), "background"),
        ),
      );
      const selected = mix(
        background,
        chromeNeutral,
        chromeNeutralMix(
          declaration(
            ruleBody('#tab-strip button[aria-selected="true"]'),
            "background",
          ),
        ),
      );

      expect(contrast(foreground, tab)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(foreground, hover)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(foreground, selected)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hover, tab)).toBeGreaterThan(1.08);
      expect(contrast(selected, tab)).toBeGreaterThan(1.2);
    },
  );
});

describe("Snippets Sidebar theme contrast", () => {
  it("keeps chrome surfaces neutral when the Terminal Theme foreground is warm", () => {
    expect(declaration(ruleBody(":root"), "--terminal-chrome-neutral")).toBe(
      "#808090",
    );

    for (const selector of [
      "#snippets-sidebar",
      '#snippets-sidebar input[type="search"]',
      "#snippets-sidebar li button:hover",
    ]) {
      const background = declaration(ruleBody(selector), "background");
      expect(background).toContain("--terminal-chrome-neutral");
      expect(background).not.toContain("--terminal-foreground");
    }

    expect(
      declaration(
        ruleBody("#snippets-sidebar li button:focus-visible"),
        "background",
      ),
    ).toBe("transparent");
  });

  it.each([
    ["light", "#f5f5f5", "#161616"],
    [
      "dark",
      DEFAULT_TERMINAL_THEME.colors.background,
      DEFAULT_TERMINAL_THEME.colors.foreground,
    ],
  ])(
    "keeps text and interactive states visible with a representative %s theme",
    async (_name, backgroundHex, foregroundHex) => {
      const root = document.createElement("aside");
      root.id = "snippets-sidebar";
      root.hidden = true;
      document.body.append(root);
      const sidebar = createSnippetsSidebar(root, {
        loadSnippets: vi.fn(async () => ({
          snippets: [
            {
              name: "greet",
              body: "printf hello",
              description: "say hi",
              execute: false,
            },
          ],
        })),
        inject: vi.fn(),
        focusTerminal: vi.fn(),
      });
      await sidebar.toggle();

      expect(root.querySelector('input[type="search"]')).not.toBeNull();
      expect(root.querySelector(".snippet-name")).not.toBeNull();
      expect(root.querySelector(".snippet-description")).not.toBeNull();
      expect(root.querySelector(".snippets-empty")).not.toBeNull();

      const background = hexColor(backgroundHex);
      const foreground = hexColor(foregroundHex);
      const chromeNeutral = hexColor("#808090");
      const sidebarRule = ruleBody("#snippets-sidebar");
      const inputRule = ruleBody('#snippets-sidebar input[type="search"]');
      expect(declaration(sidebarRule, "color")).toContain(
        "--terminal-foreground",
      );
      expect(declaration(inputRule, "color")).toBe("inherit");
      expect(
        declaration(ruleBody("#snippets-sidebar li button"), "color"),
      ).toBe("inherit");

      const inputFocusRule = ruleBody(
        '#snippets-sidebar input[type="search"]:focus',
      );
      const buttonHoverRule = ruleBody("#snippets-sidebar li button:hover");
      const buttonFocusRule = ruleBody(
        "#snippets-sidebar li button:focus-visible",
      );
      const descriptionRule = ruleBody(
        "#snippets-sidebar .snippet-description",
      );
      const emptyRule = ruleBody("#snippets-sidebar .snippets-empty");
      const placeholderRule = ruleBody(
        '#snippets-sidebar input[type="search"]::placeholder',
      );
      const sidebarBackground = mix(
        background,
        chromeNeutral,
        chromeNeutralMix(declaration(sidebarRule, "background")),
      );
      const inputBackground = mix(
        background,
        chromeNeutral,
        chromeNeutralMix(declaration(inputRule, "background")),
      );
      const inputBorder = mix(
        background,
        foreground,
        foregroundMix(declaration(inputRule, "border")),
      );
      const inputFocusBorder = mix(
        background,
        foreground,
        foregroundMix(declaration(inputFocusRule, "border-color")),
      );
      const hoverBackground = mix(
        background,
        chromeNeutral,
        chromeNeutralMix(declaration(buttonHoverRule, "background")),
      );
      const buttonFocusOutline = mix(
        background,
        foreground,
        foregroundMix(declaration(buttonFocusRule, "outline")),
      );
      const description = mix(
        background,
        foreground,
        foregroundMix(declaration(descriptionRule, "color")),
      );
      const empty = mix(
        background,
        foreground,
        foregroundMix(declaration(emptyRule, "color")),
      );
      const placeholder = mix(
        background,
        foreground,
        foregroundMix(declaration(placeholderRule, "color")),
      );

      expect(contrast(foreground, sidebarBackground)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(foreground, inputBackground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(description, sidebarBackground)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(empty, sidebarBackground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(placeholder, inputBackground)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(inputBorder, inputBackground)).toBeGreaterThanOrEqual(3);
      expect(
        contrast(inputFocusBorder, inputBackground),
      ).toBeGreaterThanOrEqual(3);
      expect(contrast(hoverBackground, sidebarBackground)).toBeGreaterThan(
        1.25,
      );
      expect(
        contrast(buttonFocusOutline, sidebarBackground),
      ).toBeGreaterThanOrEqual(3);

      sidebar.dispose();
      root.remove();
    },
  );
});

type Color = readonly [number, number, number];

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = terminalWindowCss.match(
    new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "u"),
  );
  expect(match?.groups?.body, `missing CSS rule ${selector}`).toBeDefined();
  return match!.groups!.body!;
}

function declaration(rule: string, property: string): string {
  const escaped = property;
  const match = rule.match(
    new RegExp(`(?:^|\\n)\\s*${escaped}:\\s*(?<value>[^;]+);`, "u"),
  );
  expect(
    match?.groups?.value,
    `missing CSS property ${property}`,
  ).toBeDefined();
  return match!.groups!.value!.replace(/\\s+/gu, " ").trim();
}

function foregroundMix(value: string): number {
  return variableMix(value, "terminal-foreground");
}

function chromeNeutralMix(value: string): number {
  return variableMix(value, "terminal-chrome-neutral");
}

function variableMix(value: string, variable: string): number {
  expect(value).toContain("--terminal-background");
  const match = value.match(
    new RegExp(`var\\(--${variable}[^)]*\\)\\s+(?<percent>\\d+)%`, "u"),
  );
  expect(
    match?.groups?.percent,
    `missing ${variable} mix in ${value}`,
  ).toBeDefined();
  return Number(match!.groups!.percent) / 100;
}

function hexColor(value: string): Color {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16),
  ) as unknown as Color;
}

function mix(background: Color, foreground: Color, amount: number): Color {
  return background.map(
    (channel, index) => channel * (1 - amount) + foreground[index]! * amount,
  ) as unknown as Color;
}

function contrast(first: Color, second: Color): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function luminance(color: Color): number {
  return color
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (total, channel, index) =>
        total + channel * [0.2126, 0.7152, 0.0722][index]!,
      0,
    );
}
