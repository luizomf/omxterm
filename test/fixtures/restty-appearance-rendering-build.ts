import { prepareFixture, type FixtureCleanupOwner } from "./prepare-fixture";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import {
  resttyAppearanceMainSource,
  type AppearanceScenario,
} from "./restty-appearance-main";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export const expectedColors = [
  "#010203",
  "#a1b2c3",
  "#314159",
  "#fefefe",
  "#101011",
  "#201012",
  "#102013",
  "#303014",
  "#101025",
  "#301026",
  "#103027",
  "#d0d0d8",
  "#505059",
  "#90105a",
  "#10905b",
  "#90905c",
  "#10109d",
  "#90109e",
  "#10909f",
  "#f0f0f0",
  "#123abc",
  "#abcdef",
] as const;

export const resultPrefix = "__OMXTERM_RESTTY_APPEARANCE_RESULT__";

export async function buildFixture(
  root: string,
  cleanupOwner: FixtureCleanupOwner = "recipe",
  scenario?: AppearanceScenario,
): Promise<void> {
  return prepareFixture(
    root,
    async (start) => {
      await build({
        absWorkingDir: projectRoot,
        bundle: true,
        entryPoints: ["test/fixtures/restty-appearance-renderer.ts"],
        plugins: [
          {
            name: "configured-font-reference",
            setup(builder) {
              builder.onLoad(
                { filter: /terminal-font-stack\.ts$/ },
                async ({ path: sourcePath }) => {
                  // Reference omits bold faces but retains the production font pipeline.
                  const source = await readFile(sourcePath, "utf8");
                  return {
                    loader: "ts",
                    contents:
                      source.replace(
                        "export function terminalFontInputs",
                        "function productionTerminalFontInputs",
                      ) +
                      `
export function terminalFontInputs(data: TerminalFontData): TerminalFontInput[] {
  const fonts = productionTerminalFontInputs(data);
  return document.body.dataset.referenceFonts === 'true' ? fonts.filter(font => font.weight !== 700) : fonts;
}`,
                  };
                },
              );
            },
          },
        ],
        format: "iife",
        loader: { ".ttf": "binary" },
        logLevel: "silent",
        outfile: path.join(root, "renderer.js"),
        platform: "browser",
      });
      const productionHtml = await readFile(
        path.join(projectRoot, "src/renderer/index.html"),
        "utf8",
      );
      const policy = productionHtml.match(/content="(?<policy>[^"]+)"/u)?.groups
        ?.policy;
      if (!policy) throw new Error("Production renderer CSP is missing");

      await Promise.all([
        start(() =>
          build({
            absWorkingDir: projectRoot,
            entryPoints: ["test/fixtures/restty-selection-gesture.ts"],
            bundle: true,
            platform: "node",
            format: "cjs",
            outfile: path.join(root, "selection.cjs"),
          }),
        ),
        start(() =>
          writeFile(
            path.join(root, "index.html"),
            `<!doctype html><html style="--native-title-inset:0px"><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="./renderer.css"></head><body><div id="terminal-window-content"><div id="terminal-tabs"></div></div><script src="./renderer.js"></script></body></html>`,
          ),
        ),
        start(() =>
          copyFile(
            path.join(projectRoot, "src/renderer/terminal-window.css"),
            path.join(root, "renderer.css"),
          ),
        ),
        start(() =>
          writeFile(
            path.join(root, "package.json"),
            `${JSON.stringify({ name: "omxterm-restty-appearance", main: "main.cjs" })}\n`,
          ),
        ),
        start(() =>
          writeFile(
            path.join(root, "main.cjs"),
            resttyAppearanceMainSource(expectedColors, resultPrefix, scenario),
          ),
        ),
        start(() => mkdir(path.join(root, "home"), { recursive: true })),
      ]);
    },
    cleanupOwner,
  );
}
