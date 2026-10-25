// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSnippetsView } from "../../src/renderer/snippets-sidebar";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { terminalPaneAccent } from "../../src/renderer/terminal-pane-accent";

const terminalWindowCss = readFileSync(
  "src/renderer/terminal-window.css",
  "utf8",
);

describe("Restty Terminal Window viewport", () => {
  it("uses the complete Surface and leaves no legacy xterm styling", () => {
    expect(ruleBody(".restty-terminal-surface")).toContain("display: flex");
    expect(ruleBody(".restty-terminal-surface canvas")).toContain(
      "width: 100%",
    );
    expect(terminalWindowCss).not.toContain(".xterm");
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

describe("Pane and auxiliary separator presentation", () => {
  it("shares 1px paint and neutral hover/drag while retaining resize geometry", () => {
    expect(declaration(ruleBody(".terminal-pane-divider"), "flex")).toBe(
      "0 0 var(--terminal-pane-divider-size, 4px)",
    );
    expect(declaration(ruleBody(".auxiliary-separator"), "flex")).toBe(
      "0 0 6px",
    );
    const line = ruleBody(".terminal-pane-divider::before");
    expect(ruleBody(".auxiliary-separator::before")).toBe(line);
    expect(declaration(line, "width")).toBe("1px");
    expect(declaration(line, "inset")).toBe("0 auto 0 50%");
    expect(declaration(line, "pointer-events")).toBe("none");
    expect(foregroundMix(declaration(line, "background"))).toBe(0.18);
    const horizontal = ruleBody(
      '.terminal-pane-split[data-direction="column"] > .terminal-pane-divider::before',
    );
    expect(declaration(horizontal, "height")).toBe("1px");
    expect(declaration(horizontal, "width")).toBe("auto");
    expect(declaration(horizontal, "inset")).toBe("50% 0 auto");
    const hover = ruleBody(".terminal-pane-divider:hover::before");
    expect(foregroundMix(declaration(hover, "background"))).toBe(0.45);
    for (const selector of [
      ".terminal-pane-divider.dragging::before",
      ".auxiliary-separator:hover::before",
      ".auxiliary-separator.dragging::before",
    ])
      expect(ruleBody(selector)).toBe(hover);
  });

  it("paints keyboard focus on the line, not the resize rectangle", () => {
    for (const selector of [".terminal-pane-divider", ".auxiliary-separator"]) {
      expect(
        declaration(ruleBody(`${selector}:focus-visible`), "outline"),
      ).toBe("none");
      expect(
        declaration(
          ruleBody(`${selector}:focus-visible:not(.dragging)::before`),
          "background",
        ),
      ).toBe("var(--terminal-foreground, #e6e6e6)");
    }
  });

  it("overlays only the focused split pane's top edge without intercepting input or changing geometry", () => {
    const surface = ruleBody(".terminal-surface");
    expect(declaration(surface, "position")).toBe("relative");
    expect(declaration(surface, "isolation")).toBe("isolate");
    expect(surface).not.toContain("z-index");
    const marker = ruleBody(
      ".terminal-tab[data-split] .terminal-surface.pane-focused::after",
    );
    expect(declaration(marker, "content")).toBe('""');
    expect(declaration(marker, "position")).toBe("absolute");
    expect(declaration(marker, "z-index")).toBe("1");
    expect(declaration(marker, "top")).toBe("0");
    expect(declaration(marker, "height")).toBe("1px");
    expect(declaration(marker, "left")).toBe(
      "var(--terminal-padding-left, 8px)",
    );
    expect(declaration(marker, "right")).toBe(
      "var(--terminal-padding-right, 8px)",
    );
    expect(declaration(marker, "background")).toBe(
      "var(--terminal-pane-accent, var(--terminal-foreground))",
    );
    expect(declaration(marker, "pointer-events")).toBe("none");
    expect(marker).not.toMatch(
      /(?:^|\n)\s*(?:box-shadow|border|outline|padding|margin|background-image):/u,
    );
    expect(
      terminalWindowCss.match(/\.terminal-surface[^{}]*::after\s*\{/gu),
    ).toEqual([".terminal-surface.pane-focused::after {"]);
  });

  it.each([
    [
      "bundled omtheme",
      DEFAULT_TERMINAL_THEME.colors.background,
      DEFAULT_TERMINAL_THEME.colors.foreground,
      DEFAULT_TERMINAL_THEME.colors.cyan,
    ],
    [
      "representative light",
      "#f5f5f5",
      "#161616",
      DEFAULT_TERMINAL_THEME.colors.cyan,
    ],
    ["light with sufficient cyan", "#f5f5f5", "#161616", "#006b80"],
  ])(
    "keeps an opaque-background indicator at least 3:1 for %s",
    (_name, background, foreground, cyan) => {
      const theme = {
        ...DEFAULT_TERMINAL_THEME,
        colors: {
          ...DEFAULT_TERMINAL_THEME.colors,
          background,
          foreground,
          cyan,
        },
      };
      const cyanContrast = contrast(hexColor(cyan), hexColor(background));
      const accent = terminalPaneAccent(theme);
      expect(accent).toBe(cyanContrast >= 3 ? cyan : foreground);
      expect(
        contrast(hexColor(accent), hexColor(background)),
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(hexColor(foreground), hexColor(background)),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it("does not replace cyan with a worse foreground in a low-contrast custom theme", () => {
    const theme = {
      ...DEFAULT_TERMINAL_THEME,
      colors: {
        ...DEFAULT_TERMINAL_THEME.colors,
        background: "#ffffff",
        cyan: "#cccccc",
        foreground: "#eeeeee",
      },
    };
    expect(terminalPaneAccent(theme)).toBe(theme.colors.cyan);
    expect(
      contrast(
        hexColor(terminalPaneAccent(theme)),
        hexColor(theme.colors.background),
      ),
    ).toBeLessThan(3);
  });
});

describe("Snippets Sidebar theme contrast", () => {
  it("keeps chrome surfaces neutral when the Terminal Theme foreground is warm", () => {
    expect(declaration(ruleBody(":root"), "--terminal-chrome-neutral")).toBe(
      "#808090",
    );

    for (const selector of [
      ".auxiliary-panel",
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
      const sidebar = createSnippetsView(document, {
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
        preview: vi.fn(),
        isInteractive: () => true,
      });
      root.append(sidebar.element);
      sidebar.activate();
      await vi.waitFor(() =>
        expect(root.querySelector(".snippet-name")).not.toBeNull(),
      );

      expect(root.querySelector('input[type="search"]')).not.toBeNull();
      expect(root.querySelector(".snippet-name")).not.toBeNull();
      expect(root.querySelector(".snippet-description")).not.toBeNull();
      expect(root.querySelector(".snippets-empty")).not.toBeNull();

      const background = hexColor(backgroundHex);
      const foreground = hexColor(foregroundHex);
      const chromeNeutral = hexColor("#808090");
      const sidebarRule = ruleBody(".auxiliary-panel");
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
      expect(declaration(inputRule, "background")).toBe("transparent");
      const inputBackground = sidebarBackground;
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
        sidebarBackground,
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
  const match = [...terminalWindowCss.matchAll(/([^{}]+)\{([^}]*)\}/gu)].find(
    (rule) =>
      rule[1]!
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .split(",")
        .some((value) => value.trim() === selector),
  );
  expect(match?.[2], `missing CSS rule ${selector}`).toBeDefined();
  return match![2]!;
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
  return match!.groups!.value!.replace(/\s+/gu, " ").trim();
}

function foregroundMix(value: string): number {
  return variableMix(value, "terminal-foreground");
}

function chromeNeutralMix(value: string): number {
  expect(value).toContain("transparent");
  expect(value).toContain("--terminal-background-opacity");
  const match = value.match(
    /var\(--terminal-chrome-neutral\)\s+calc\((?<percent>[\d.]+)%/u,
  );
  expect(match?.groups?.percent).toBeDefined();
  return Number(match!.groups!.percent) / 100;
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
