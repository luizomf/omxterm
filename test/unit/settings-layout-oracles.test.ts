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
import { exerciseSettingsDialog } from "../fixtures/settings-dialog-exercise";

vi.mock("electron", () => ({ ipcMain: {} }));
import {
  exerciseSettingsLayout,
  targetSettingsGeometry,
} from "../fixtures/settings-layout-exercise";

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
function layoutPort(mode = "normal", restoreFails = false) {
  const original = { x: 50, y: 40, width: 961, height: 642 };
  let outer = { ...original },
    width = 960,
    height = 640,
    selected = "general",
    light = false;
  const contentRequests: number[][] = [],
    nativeRequests: number[][] = [],
    restoredBounds: unknown[] = [],
    categories: string[] = [],
    order: string[] = [];
  const panelWidth = () => width - (width >= 900 ? 200 : 40);
  const window = {
    getBounds: () => ({ ...outer }),
    getContentBounds: () => ({
      x: 51,
      y: 40,
      width: mode === "invalid" ? NaN : width,
      height,
    }),
    getContentSize: () => [width, height],
    getMinimumSize: () => [
      mode === "changed-minimum" && nativeRequests.length ? 321 : 320,
      200,
    ],
    setMinimumSize: vi.fn(() => {
      throw Error("Minimum must not be mutated");
    }),
    setSize(w: number, h: number) {
      nativeRequests.push([w, h]);
      if (mode !== "ignored-minimum") {
        width = 320;
        height = 201;
        outer = { ...outer, width: 321, height: 202 };
      }
    },
    setContentSize(w: number, h: number) {
      contentRequests.push([w, h]);
      if (w === 320)
        throw Error("Native-minimum sample used the content-size domain");
      width = w;
      height = mode === "unreachable" && w === 640 ? 481 : h + 1;
      outer = { ...outer, width: width + 1, height: height + 1 };
    },
    setBounds(bounds: typeof original) {
      restoredBounds.push(bounds);
      order.push("bounds");
      outer = { ...bounds };
    },
    webContents: {
      sendInputEvent() {},
      capturePage: vi.fn(async () => {
        order.push("capture");
        return { toPNG: () => Buffer.from("synthetic PNG port") };
      }),
      async executeJavaScript(script: string) {
        if (script.startsWith("["))
          return [
            script.includes("settings-panels") ? panelWidth() : width,
            height,
          ];
        if (script.includes("measureText")) {
          const observation = {
            ...sample(
              panelWidth(),
              panelWidth() < 560 ? "stacked" : "columns",
              panelWidth() < 760 ? "wrapped" : "inline",
              `settings-panel-${selected}`,
            ),
            width,
            height,
            scheme: light ? "light" : "dark",
          };
          if (mode === "category")
            return {
              ...observation,
              panels: observation.panels.map((p) => ({
                ...p,
                display:
                  p.id === "settings-panel-config-file" ? "flex" : "none",
              })),
            };
          return {
            ...observation,
            focus: mode !== "focus",
            height: mode === "unstable" ? height + 1 : height,
          };
        }
        const category = /#settings-tab-([a-z-]+)'/u.exec(script)?.[1];
        if (category) {
          selected = category;
          categories.push(category);
        }
        if (script.includes(":focus-visible")) return true;
        if (script.includes(".settings-panels")) return panelWidth();
        return undefined;
      },
    },
  };
  return {
    window: window as unknown as BrowserWindow,
    original,
    contentRequests,
    nativeRequests,
    restoredBounds,
    categories,
    order,
    capture: window.webContents.capturePage,
    setMinimum: window.setMinimumSize,
    configure: (_language: string, value: boolean) => {
      light = value;
    },
    restore: () => {
      order.push("restore");
      if (restoreFails) throw Error("secondary restoration failure");
    },
  };
}

it("samples native minimum at actual compact 320x201 while preserving five exact targets and breakpoint corrections", async () => {
  vi.stubEnv("OMXTERM_SETTINGS_EVIDENCE_DIR", undefined);
  const directory = await mkdtemp(
    path.join(tmpdir(), "omxterm-layout-target-"),
  );
  const previousArgs = [...process.argv];
  process.argv.push(`--fixture-settings-evidence=${directory}`);
  const port = layoutPort();
  try {
    const result = await exerciseSettingsLayout(
      port.window,
      port.configure,
      port.restore,
    );
    expect(result).toEqual({
      cases: 144,
      breakpoints: 4,
      synthetic: true,
      physicalKeyboard: false,
      originalViewport: { width: 960, height: 640 },
      compact: ["en-US", "pt-BR"].flatMap((language) =>
        [false, true].map((light) => ({
          kind: "native-minimum-request",
          language,
          light,
          requestedMinimum: { width: 320, height: 200 },
          outer: { width: 321, height: 202 },
          content: { width: 320, height: 201 },
          viewport: { width: 320, height: 201 },
        })),
      ),
    });
    expect(port.nativeRequests).toEqual(
      Array.from({ length: 4 }, () => [320, 200]),
    );
    expect(port.contentRequests.slice(0, 40)).toEqual(
      Array.from({ length: 4 }, () =>
        [
          [640, 480],
          [800, 600],
          [960, 640],
          [1280, 800],
          [1920, 1080],
        ].flatMap(([w, h]) => [
          [w, h],
          [w, h! - 1],
        ]),
      ).flat(),
    );
    expect(port.contentRequests.every(([w, h]) => w! > 320 && h! > 360)).toBe(
      true,
    );
    const at = port.contentRequests.findIndex(([w]) => w === 1000);
    expect(port.contentRequests.slice(at, at + 3)).toEqual([
      [1000, 640],
      [759, 639],
      [599, 639],
    ]);
    expect(port.restoredBounds).toEqual([port.original]);
    expect(port.setMinimum).not.toHaveBeenCalled();
    expect(port.categories).toHaveLength(153); // 144 matrix + 8 breakpoint + final General.
  } finally {
    process.argv = previousArgs;
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

it.each(["unchanged", "bounds", "minimum"])(
  "checks opening native %s geometry after focus and before configuration edits",
  async (mode) => {
    const stop = new Error("Stop before deliberate configuration edit");
    const order: string[] = [];
    let bounds = { x: 1, y: 40, width: 961, height: 642 },
      minimum = [320, 200];
    const window = {
      focus() {
        order.push("focus");
        bounds = { ...bounds, x: 50 };
      },
      getBounds: () => ({ ...bounds }),
      getMinimumSize: () => [...minimum],
      webContents: {
        executeJavaScript: async (script: string) => {
          if (script.includes("dispatchEvent")) {
            order.push("edit");
            throw stop;
          }
          return true;
        },
      },
    } as unknown as BrowserWindow;
    const exercise = exerciseSettingsDialog(
      window,
      () => {
        order.push("show");
        if (mode === "bounds") bounds = { ...bounds, width: 962 };
        if (mode === "minimum") minimum = [321, 200];
      },
      async () => {
        throw Error("No config read allowed");
      },
      [],
      async () => {
        throw Error("No layout allowed");
      },
    );
    await expect(exercise).rejects.toThrow(
      mode === "unchanged"
        ? stop.message
        : mode === "bounds"
          ? "Opening Settings changed native bounds"
          : "Opening Settings changed native minimum",
    );
    expect(order).toEqual(
      mode === "unchanged" ? ["focus", "show", "edit"] : ["focus", "show"],
    );
  },
);

it("keeps the larger exact-target helper affine, bounded and strict about both axes and invalid requests", async () => {
  for (const bias of [0, 1]) {
    const requests: number[][] = [];
    const frame = vi.fn(async () => {});
    await targetSettingsGeometry({
      initial: [640, 480],
      target: [640, 480],
      setSize: (w, h) => {
        requests.push([w, h]);
      },
      frame,
      measure: async () =>
        requests.at(-1)!.map((value) => value + bias) as [number, number],
    });
    expect(requests).toEqual(
      bias
        ? [
            [640, 480],
            [639, 479],
          ]
        : [[640, 480]],
    );
    expect(frame).toHaveBeenCalledTimes(requests.length);
  }
  for (const width of [0, -1, Infinity, NaN]) {
    const setSize = vi.fn();
    await expect(
      targetSettingsGeometry({
        initial: [width, 480],
        target: [640, 480],
        setSize,
        frame: async () => {},
        measure: async () => [640, 480],
      }),
    ).rejects.toThrow("Settings invalid geometry request");
    expect(setSize).not.toHaveBeenCalled();
  }
});

it.each([
  ["category", "rendered panel does not match click"],
  ["focus", "Settings unreachable control"],
  ["ignored-minimum", "native-minimum request did not reach compact viewport"],
  ["invalid", "Settings invalid geometry"],
  ["changed-minimum", "Settings changed native minimum bounds"],
  ["unstable", "202 !== 201"],
  ["unreachable", "Settings exact geometry target was not reached"],
])(
  "captures failed %s before single outer restoration without masking the primary error",
  async (mode, message) => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "omxterm-layout-failure-"),
    );
    const previousArgs = [...process.argv];
    vi.stubEnv("OMXTERM_SETTINGS_EVIDENCE_DIR", undefined);
    process.argv.push(`--fixture-settings-evidence=${directory}`);
    const port = layoutPort(mode, mode === "category");
    try {
      await expect(
        exerciseSettingsLayout(port.window, port.configure, port.restore),
      ).rejects.toThrow(message);
      expect(port.nativeRequests).toEqual([[320, 200]]);
      expect(port.contentRequests).toEqual(
        mode === "unreachable"
          ? [
              [640, 480],
              [640, 479],
              [640, 478],
            ]
          : [],
      );
      expect(port.restoredBounds).toEqual([port.original]);
      expect(port.setMinimum).not.toHaveBeenCalled();
      expect(port.capture).toHaveBeenCalledOnce();
      expect(port.order).toEqual(["capture", "restore", "bounds"]);
      const [name] = await readdir(directory);
      const metadata = JSON.parse(
        await readFile(path.join(directory, name!, "observation.json"), "utf8"),
      ) as {
        context: { category?: string; targetKind: string; compact?: unknown };
        observation: SettingsLayoutObservation;
        screenshot: boolean;
      };
      expect(metadata.context.category).toBe(
        ["category", "focus", "unstable"].includes(mode)
          ? "general"
          : undefined,
      );
      expect(metadata.context.targetKind).toBe(
        mode === "unreachable" ? "exact-viewport" : "native-minimum-request",
      );
      expect(metadata.screenshot).toBe(true);
      expect(
        await readFile(path.join(directory, name!, "frame.png"), "utf8"),
      ).toBe("synthetic PNG port");
    } finally {
      process.argv = previousArgs;
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
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
