import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { screen, type BrowserWindow, type Display } from "electron";
import { assertSettingsDisplayGeometry } from "../fixtures/settings-layout-display";
import { exerciseSettingsLayout } from "../fixtures/settings-layout-exercise";

vi.mock("electron", () => ({ screen: { getDisplayMatching: vi.fn() } }));

it.each([
  { width: 1696, height: 957, scaleFactor: 1 },
  { width: 1919, height: 1400, scaleFactor: 1 },
  { width: 2560, height: 1081, scaleFactor: 1 },
  { width: 1707, height: 1067, scaleFactor: 1.5 },
])(
  "fails insufficient logical work area $width x $height before any matrix work",
  async (area) => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "omxterm-layout-display-"),
    );
    vi.stubEnv("OMXTERM_SETTINGS_EVIDENCE_DIR", undefined);
    const previousArgs = [...process.argv];
    process.argv.push(`--fixture-settings-evidence=${directory}`);
    vi.mocked(screen.getDisplayMatching).mockReturnValueOnce({
      bounds: { x: -2560, y: 0, width: 2560, height: 1600 },
      workArea: { x: -2560, y: 32, width: area.width, height: area.height },
      scaleFactor: area.scaleFactor,
    } as Display);
    const original = { x: -2500, y: 50, width: 961, height: 642 };
    const setSize = vi.fn(),
      setContentSize = vi.fn(),
      setBounds = vi.fn();
    const capturePage = vi.fn(async () => ({
      toPNG: () => Buffer.from("synthetic PNG port"),
    }));
    const window = {
      getBounds: () => original,
      getContentBounds: () => ({ ...original, width: 960, height: 640 }),
      getContentSize: () => [960, 640],
      getMinimumSize: () => [320, 200],
      setSize,
      setContentSize,
      setBounds,
      webContents: {
        getZoomFactor: () => 1,
        executeJavaScript: vi.fn(async () => null),
        capturePage,
      },
    } as unknown as BrowserWindow;
    const configure = vi.fn(),
      restore = vi.fn();
    try {
      await expect(
        exerciseSettingsLayout(window, configure, restore),
      ).rejects.toThrow(
        /Settings layout display prerequisite.*1920x1080.*1921x1082.*Provision.*settings-only/su,
      );
      expect(screen.getDisplayMatching).toHaveBeenLastCalledWith(original);
      expect(configure).not.toHaveBeenCalled();
      expect(setSize).not.toHaveBeenCalled();
      expect(setContentSize).not.toHaveBeenCalled();
      expect(capturePage).toHaveBeenCalledOnce();
      expect(restore).toHaveBeenCalledOnce();
      expect(setBounds).toHaveBeenCalledExactlyOnceWith(original);
      const [name] = await readdir(directory);
      const metadata = JSON.parse(
        await readFile(path.join(directory, name!, "observation.json"), "utf8"),
      ) as { context: { phase: string } };
      expect(metadata.context.phase).toBe("display-prerequisite");
    } finally {
      process.argv = previousArgs;
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

function geometry(width = 1920, height = 1080, scaleFactor = 1) {
  return {
    outer: { width: 960, height: 640 },
    content: { width: 960, height: 640 },
    zoom: 1,
    display: { workArea: { width, height }, scaleFactor },
  };
}

it.each([1, 1.25, 2])(
  "accepts exact logical capacity without multiplying by display scale %s",
  (scale) => {
    expect(() =>
      assertSettingsDisplayGeometry(geometry(1920, 1080, scale)),
    ).not.toThrow();
  },
);

it("includes the observed native frame on both axes, not renderer chrome", () => {
  const value = geometry(1936, 1119);
  value.outer = { width: 976, height: 679 };
  expect(() => assertSettingsDisplayGeometry(value)).not.toThrow();
  for (const dimension of ["width", "height"] as const) {
    const tooSmall = {
      ...value,
      display: { ...value.display, workArea: { ...value.display.workArea } },
    };
    tooSmall.display.workArea[dimension] -= 1;
    expect(() => assertSettingsDisplayGeometry(tooSmall)).toThrow(
      "1936x1119 DIP",
    );
  }
});

it("converts renderer zoom, not physical display scale, before adding the frame", () => {
  const value = geometry(2416, 1389, 2);
  value.outer = { width: 976, height: 679 };
  value.zoom = 1.25;
  expect(() => assertSettingsDisplayGeometry(value)).not.toThrow();
  value.display.workArea.height -= 1;
  expect(() => assertSettingsDisplayGeometry(value)).toThrow("2416x1389 DIP");
});

it.each([NaN, Infinity, 0, -1])(
  "rejects invalid geometry %s rather than admitting a matrix",
  (invalid) => {
    const value = geometry();
    value.display.workArea.width = invalid;
    expect(() => assertSettingsDisplayGeometry(value)).toThrow(
      "Settings invalid geometry",
    );
    value.display.workArea.width = 1920;
    value.zoom = invalid;
    expect(() => assertSettingsDisplayGeometry(value)).toThrow(
      "Settings invalid geometry",
    );
  },
);

it("does not infer a valid frame from inverted native sizes", () => {
  const value = geometry();
  value.content.width += 1;
  expect(() => assertSettingsDisplayGeometry(value)).toThrow(
    "Settings invalid geometry for native frame",
  );
});
