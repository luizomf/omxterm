import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";
import {
  assertSettingsLayout,
  type SettingsLayoutObservation,
} from "../fixtures/settings-layout-observation";
import { captureSettingsLayoutFailure } from "../fixtures/settings-layout-failure";
import { exerciseSettingsLayout } from "../fixtures/settings-layout-exercise";

it("uses only the content query container and viewport queries for outer Settings layout", () => {
  const css = readFileSync("src/renderer/settings/settings-dialog.css", "utf8");
  const declarations = [
    ...css.matchAll(/([^{}]+)\{([^{}]*container-type:[^{}]*)\}/gu),
  ];
  expect(declarations.map((match) => match[1]!.trim())).toEqual([
    ".settings-panels",
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

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
function sample(
  contentWidth = 400,
  form = "stacked",
  shortcut = "wrapped",
  selected = "settings-panel-general",
): SettingsLayoutObservation {
  const ids = [
    "settings-panel-general",
    "settings-panel-appearance",
    "settings-panel-terminal",
    "settings-panel-window",
    "settings-panel-shortcuts",
    "settings-panel-config-file",
  ];
  return {
    panels: ids.map((id) => ({
      id,
      hidden: id !== selected,
      display: id === selected ? "flex" : "none",
      box: rect(0, 0, id === selected ? 400 : 0, id === selected ? 160 : 0),
    })),
    categories: ids.map((panel) => ({ panel, selected: panel === selected })),
    contentWidth,
    forms: [
      {
        display: form === "stacked" ? "flex" : "grid",
        direction: "column",
        label: rect(0, 0, 120, 20),
        field:
          form === "stacked" ? rect(0, 28, 112, 32) : rect(200, 0, 112, 32),
      },
    ],
    labels: [
      { box: rect(0, 0, 120, 20), naturalWidth: 100, lineHeight: 20, lines: 1 },
    ],
    shortcuts:
      selected === "settings-panel-shortcuts"
        ? [0, 100].map((top) => ({
            columns: shortcut === "wrapped" ? 2 : 3,
            name: rect(0, top + 8, 120, 20),
            binding: rect(136, top + 8, 120, 36),
            actions:
              shortcut === "wrapped"
                ? rect(0, top + 52, 238, 32)
                : rect(500, top + 8, 238, 32),
          }))
        : [],
    overflow: false,
    focus: true,
    scheme: "dark",
    width: 320,
    height: 200,
  };
}
it("rejects the native category/display mismatch even when exactly one panel renders", () => {
  const observation = sample();
  const mismatch = {
    ...observation,
    panels: observation.panels.map((panel) => ({
      ...panel,
      display: panel.id === "settings-panel-config-file" ? "flex" : "none",
    })),
  };
  expect(
    mismatch.panels.filter((panel) => panel.display !== "none"),
  ).toHaveLength(1);
  expect(() =>
    assertSettingsLayout(mismatch, "settings-panel-general"),
  ).toThrow("rendered panel does not match click");
  const wrongHidden = {
    ...observation,
    panels: observation.panels.map((panel) => ({
      ...panel,
      hidden: panel.id === "settings-panel-general",
    })),
  };
  expect(() =>
    assertSettingsLayout(wrongHidden, "settings-panel-general"),
  ).toThrow("hidden state does not match click");
  expect(() =>
    assertSettingsLayout(observation, "settings-panel-config-file"),
  ).toThrow("selected category does not match click");
});
it.each([
  [559, "stacked"],
  [560, "columns"],
] as const)(
  "requires the real form layout at content width %s",
  (width, layout) => {
    expect(() =>
      assertSettingsLayout(sample(width, layout), "settings-panel-general"),
    ).not.toThrow();
    expect(() =>
      assertSettingsLayout(
        sample(width, layout === "stacked" ? "columns" : "stacked"),
        "settings-panel-general",
      ),
    ).toThrow("form did not follow content breakpoint");
  },
);
it.each([
  [759, "wrapped"],
  [760, "inline"],
] as const)(
  "requires the real shortcut action layout at content width %s",
  (width, layout) => {
    expect(() =>
      assertSettingsLayout(
        sample(width, "columns", layout, "settings-panel-shortcuts"),
        "settings-panel-shortcuts",
      ),
    ).not.toThrow();
    expect(() =>
      assertSettingsLayout(
        sample(
          width,
          "columns",
          layout === "wrapped" ? "inline" : "wrapped",
          "settings-panel-shortcuts",
        ),
        "settings-panel-shortcuts",
      ),
    ).toThrow("shortcuts did not follow content breakpoint");
  },
);
it("rejects the removed-inner-container control and one-character-per-line labels", () => {
  expect(() =>
    assertSettingsLayout(sample(400, "columns"), "settings-panel-general"),
  ).toThrow("form did not follow content breakpoint");
  const observation = sample();
  expect(() =>
    assertSettingsLayout(
      {
        ...observation,
        labels: [
          {
            box: rect(0, 0, 8, 320),
            naturalWidth: 100,
            lineHeight: 20,
            lines: 16,
          },
        ],
      },
      "settings-panel-general",
    ),
  ).toThrow("label collapsed below readable width");
  expect(() =>
    assertSettingsLayout(
      { ...observation, labels: [{ ...observation.labels[0]!, lines: 16 }] },
      "settings-panel-general",
    ),
  ).toThrow("label wraps into excessive lines");
});
it("captures the actual failed category state before restoring the renderer", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "omxterm-layout-failure-"),
  );
  const previousArgs = [...process.argv];
  vi.stubEnv("OMXTERM_SETTINGS_EVIDENCE_DIR", undefined);
  process.argv.push(`--fixture-settings-evidence=${directory}`);
  const order: string[] = [];
  const observation = sample();
  const mismatch = {
    ...observation,
    panels: observation.panels.map((panel) => ({
      ...panel,
      display: panel.id === "settings-panel-config-file" ? "flex" : "none",
    })),
  };
  const capturePage = vi.fn(async () => {
    order.push("capture");
    return { toPNG: () => Buffer.from("synthetic PNG port") };
  });
  const window = {
    getContentBounds: () => ({ width: 960, height: 640 }),
    getContentSize: () => [320, 200],
    getMinimumSize: () => [320, 200],
    setContentSize: (width: number) => {
      order.push(`size-${width}`);
    },
    webContents: {
      executeJavaScript: async (script: string) =>
        script.includes("measureText") ? mismatch : undefined,
      capturePage,
    },
  } as unknown as BrowserWindow;
  try {
    await expect(
      exerciseSettingsLayout(
        window,
        () => {},
        () => {
          order.push("restore");
        },
      ),
    ).rejects.toThrow("rendered panel does not match click");
    expect(capturePage).toHaveBeenCalledOnce();
    expect(order.indexOf("capture")).toBeLessThan(order.indexOf("restore"));
    const [name] = await readdir(directory);
    const metadata = JSON.parse(
      await readFile(path.join(directory, name!, "observation.json"), "utf8"),
    ) as {
      context: { category: string };
      observation: SettingsLayoutObservation;
      screenshot: boolean;
    };
    expect(metadata.context.category).toBe("general");
    expect(metadata.observation.panels).toEqual(mismatch.panels);
    expect(metadata.screenshot).toBe(true);
    expect(
      await readFile(path.join(directory, name!, "frame.png"), "utf8"),
    ).toBe("synthetic PNG port");
  } finally {
    process.argv = previousArgs;
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
it.each(["capture-error", "empty", "oversize"] as const)(
  "keeps bounded diagnostics when screenshot is %s without replacing the oracle failure",
  async (mode) => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "omxterm-layout-capture-"),
    );
    const capture = vi.fn(async () => {
      if (mode === "capture-error")
        throw new Error("synthetic capture failure");
      return {
        toPNG: () =>
          mode === "empty"
            ? Buffer.alloc(0)
            : Buffer.allocUnsafe(32 * 1024 * 1024 + 1),
      };
    });
    try {
      const result = await captureSettingsLayoutFailure({
        directory,
        context: { phase: "matrix" },
        observation: null,
        size: () => [4000, 2000],
        capture,
        report: () => {
          throw new Error("synthetic closed stream");
        },
      });
      expect(capture).toHaveBeenCalledExactlyOnceWith({
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });
      expect(result.screenshot).toBe(false);
      expect(result.diagnostic).toBe(true);
      expect(await readdir(result.directory!)).toEqual(["observation.json"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
