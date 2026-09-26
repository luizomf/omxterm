import assert from "node:assert/strict";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { createWindowBackgroundEffects } from "../../src/main/window-background-effects";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";

for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(__dirname, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
const fail = (error: unknown) => {
  process.stderr.write(
    `${String(error instanceof Error ? error.stack : error)}\n`,
  );
  app.exit(1);
};
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
app.on("window-all-closed", () => {});

interface Phase {
  alpha: boolean;
  implicit: number[];
  equalRgb: number[];
  explicit: number[];
  inverseBackground: number[];
  image: number[];
  error: number;
  glyphs: Record<string, number>;
  inverseInk: Record<string, number>;
  ansi: Record<string, number>;
  cursor: Record<string, number>;
  starts: number;
  closes: number;
  sameCanvas: boolean;
  bodyBackground: string;
  rootBackground: string;
  tabsBackground: string;
  surfaceBackground: string;
  sidebarBackground: string;
}

app
  .whenReady()
  .then(async () => {
    const native = terminalWindowOptions(
      "",
      DEFAULT_USER_CONFIGURATION,
      process.platform,
    );
    // This synthetic Adapter fixture has no preload; the companion Window Chrome
    // fixture exercises the production preload/main/PTY route.
    delete native.webPreferences?.preload;
    const window = new BrowserWindow({
      ...native,
      width: 800,
      height: 500,
      webPreferences: { ...native.webPreferences, backgroundThrottling: false },
    });
    const effects = createWindowBackgroundEffects(window, {
      platform: process.platform,
      x11: process.platform === "linux",
    });
    await window.loadFile(path.join(__dirname, "index.html"));
    window.showInactive();
    const evaluate = async <T>(script: string): Promise<T> =>
      (await window.webContents.executeJavaScript(script, true)) as T;
    const deadline = Date.now() + 30_000;
    while (
      !(await evaluate<boolean>("globalThis.backgroundFixture?.ready ?? false"))
    ) {
      const error = await evaluate<string | undefined>(
        "document.body.dataset.fixtureError",
      );
      if (error) throw new Error(error);
      if (Date.now() > deadline)
        throw new Error("Background Surface readiness timed out");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const phases = [];
    for (const transparency of [0, 0.5, 1]) {
      effects.apply({ blur: false, transparency });
      const phase = await evaluate<Phase>(
        `backgroundFixture.phase(${transparency})`,
      );
      assert.equal(phase.alpha, true);
      assert.deepEqual(phase.implicit, [0, 0, 0, 0]);
      assert.deepEqual(phase.equalRgb, [18, 52, 86, 255]);
      assert.deepEqual(phase.explicit, [200, 40, 60, 255]);
      assert.deepEqual(phase.inverseBackground, [240, 240, 255, 255]);
      assert.deepEqual(phase.image, [255, 51, 68, 255]);
      assert.ok((phase.glyphs["240,240,255"] ?? 0) > 0, "opaque normal ink");
      assert.ok(
        (phase.inverseInk["18,52,86"] ?? 0) > 0,
        "opaque inverse default-background ink",
      );
      assert.ok((phase.ansi["0,255,191"] ?? 0) > 0, "opaque ANSI ink");
      assert.ok((phase.cursor["240,240,255"] ?? 0) > 0, "opaque cursor");
      assert.equal(phase.error, 0);
      assert.equal(phase.sameCanvas, true);
      assert.equal(phase.starts, 1);
      assert.equal(phase.closes, 0);
      for (const background of [
        phase.rootBackground,
        phase.tabsBackground,
        phase.surfaceBackground,
      ])
        assert.equal(background, "rgba(0, 0, 0, 0)");
      const image = await window.webContents.capturePage();
      const size = image.getSize();
      const bitmap = image.toBitmap();
      const alpha = bitmap[((size.height - 4) * size.width + 4) * 4 + 3]!;
      assert.ok(
        Math.abs(alpha - (1 - transparency) * 255) <= 1,
        `single page tint alpha ${alpha} at transparency ${transparency}`,
      );
      const sidebarAlpha =
        bitmap[((size.height - 4) * size.width + size.width - 4) * 4 + 3]!;
      const expectedSidebarAlpha =
        transparency === 0 ? 255 : transparency === 0.5 ? 137 : 0;
      assert.ok(
        Math.abs(sidebarAlpha - expectedSidebarAlpha) <= 1,
        `sidebar paints only its neutral overlay, not a second theme tint: ${sidebarAlpha}`,
      );
      phases.push({
        transparency,
        canvasAlpha: phase.alpha,
        pageAlpha: alpha,
        sidebarAlpha,
        body: phase.bodyBackground,
        sidebar: phase.sidebarBackground,
      });
    }
    effects.apply({ blur: true, transparency: 0.5 });
    const changed = await evaluate<Phase>(
      "backgroundFixture.phase(0.5, '#654321')",
    );
    assert.deepEqual(changed.implicit, [0, 0, 0, 0]);
    assert.deepEqual(changed.equalRgb, [18, 52, 86, 255]);
    assert.ok((changed.inverseInk["101,67,33"] ?? 0) > 0);
    assert.deepEqual(changed.image, [255, 51, 68, 255]);
    const tabs = await evaluate<{
      starts: number;
      closes: number;
      sameCanvas: boolean;
      pixels: Phase;
      future: Phase;
      selectedShadow: string;
    }>("backgroundFixture.tabs()");
    assert.equal(tabs.starts, 2);
    assert.equal(tabs.closes, 0);
    assert.equal(tabs.sameCanvas, true);
    assert.deepEqual(tabs.pixels.equalRgb, [18, 52, 86, 255]);
    assert.deepEqual(tabs.pixels.image, [255, 51, 68, 255]);
    assert.equal(tabs.future.alpha, true);
    assert.deepEqual(tabs.future.implicit, [0, 0, 0, 0]);
    assert.equal(
      tabs.selectedShadow,
      "color(srgb 0.941176 0.941176 1) 0px -1px 0px 0px inset",
      "selected tab retains its opaque #f0f0ff foreground indicator without tint",
    );
    const selection = await evaluate<Record<string, number>>(
      "backgroundFixture.selection()",
    );
    assert.ok((selection["80,80,100"] ?? 0) > 0, "opaque selection background");
    assert.ok((selection["240,240,255"] ?? 0) > 0, "opaque selection ink");
    effects.apply({ blur: false, transparency: 0.5 });
    effects.dispose();
    assert.deepEqual(await evaluate("backgroundFixture.dispose()"), {
      starts: 2,
      closes: 2,
    });
    window.destroy();
    writeSync(
      1,
      `__OMXTERM_BACKGROUND_RESULT__${JSON.stringify({ platform: process.platform, phases, explicitBackgrounds: true, opaqueForeground: true, liveTheme: true, tabs: true, nativeRequestOnly: true })}\n`,
    );
    app.exit(0);
  })
  .catch(fail);
