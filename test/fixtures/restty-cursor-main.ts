import { app, BrowserWindow, ipcMain, type NativeImage } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { loadTerminalFontData } from "../../src/main/terminal-font-data";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import {
  runCursorStep,
  CURSOR_STEP_TIMEOUT,
  type CursorStep,
} from "./restty-cursor-readiness";

// The bundled fixture lives in its disposable profile directory. Electron
// command-line switches have platform-dependent argv placement.
const root = __dirname;
const family =
  process.platform === "darwin"
    ? "Menlo"
    : process.platform === "win32"
      ? "Consolas"
      : "DejaVu Sans Mono";
interface Phase {
  cellWidth: number;
  cellHeight: number;
  dpr: number;
  padding: number;
  starts: number;
  closes: number;
  sameCanvas: boolean;
  canvas: { x: number; y: number; width: number; height: number };
  available: { x: number; y: number; width: number; height: number };
}
function ink(bitmap: Buffer, blank: Buffer, width: number) {
  let count = 0,
    left = Infinity,
    right = -1,
    top = Infinity,
    bottom = -1;
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    if (
      Math.abs(bitmap[offset]! - blank[offset]!) +
        Math.abs(bitmap[offset + 1]! - blank[offset + 1]!) +
        Math.abs(bitmap[offset + 2]! - blank[offset + 2]!) <=
      24
    )
      continue;
    count++;
    const x = (offset / 4) % width,
      y = Math.floor(offset / 4 / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return {
    count,
    left,
    right,
    top,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}
async function prepareWindow(
  window: BrowserWindow,
): Promise<{ dpr: 1 | 2; control: string | undefined }> {
  const dpr = Number(
    app.commandLine.getSwitchValue("force-device-scale-factor"),
  );
  assert.ok(
    dpr === 1 || dpr === 2,
    "Cursor fixture requires requested DPR 1 or 2",
  );
  const control = process.argv
    .find((arg) => arg.startsWith("--fixture-cursor-control="))
    ?.split("=")[1];
  assert.ok(
    control === undefined ||
      ["early-minimize", "early-hide", "held-execute", "held-capture"].includes(
        control,
      ),
    "Unknown cursor fixture control",
  );
  if (control === "held-execute") {
    window.webContents.on("console-message", (details) => {
      // Forward only a fixed gate marker, never arbitrary renderer messages.
      if (details.message === "__OMXTERM_CURSOR_CONTROL__held-execute")
        process.stdout.write("__OMXTERM_CURSOR_CONTROL__held-execute\n");
    });
  }
  await runCursorStep(
    window,
    {
      dpr,
      font: "bundled",
      padding: 0,
      lifecycle: "load",
      kind: "execute",
      operation: "load",
    },
    () =>
      window.loadFile(path.join(root, "index.html"), {
        query: { cursorControl: control ?? "ordinary" },
      }),
  );
  window.showInactive();
  if (control === "early-minimize" || control === "early-hide") {
    assert.ok(
      window.isVisible() && !window.isMinimized(),
      "Native cursor control requires an initially presented window",
    );
    // Explicit real native actions, never a failed-minimize fallback or DOM state.
    const observed =
      control === "early-hide"
        ? () => !window.isVisible() && !window.isMinimized()
        : () => window.isMinimized();
    if (control === "early-hide") window.hide();
    else window.minimize();
    const deadline = Date.now() + CURSOR_STEP_TIMEOUT;
    while (!observed() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(observed(), `Native ${control} control was not observed`);
    process.stdout.write(`__OMXTERM_CURSOR_CONTROL__${control}\n`);
  }
  return { dpr, control };
}

async function holdControlledCapture(
  control: string | undefined,
  count: number,
  name: string,
  captured: NativeImage,
) {
  // Prove native capture completed before withholding its delivery.
  if (control === "held-capture" && count === 0 && name === "hidden") {
    assert.ok(
      !captured.isEmpty() &&
        captured.getSize().width > 0 &&
        captured.getSize().height > 0,
    );
    process.stdout.write("__OMXTERM_CURSOR_CONTROL__held-capture\n");
    await new Promise<void>(() => {});
  }
}

function cursorContext(
  dpr: 1 | 2,
  configured: boolean,
  padding: 0 | 8,
  lifecycle: CursorStep["lifecycle"],
): Omit<CursorStep, "kind" | "operation"> {
  return {
    dpr,
    font: configured ? "configured" : "bundled",
    padding: lifecycle === "reload" ? (padding === 0 ? 8 : 0) : padding,
    lifecycle,
  };
}

async function run() {
  applyChromiumSandboxPolicy(app.commandLine);
  for (const name of ["userData", "sessionData"] as const) {
    await mkdir(path.join(root, name), { recursive: true });
    app.setPath(name, path.join(root, name));
  }
  ipcMain.handle("fonts", () => loadTerminalFontData(family));
  await app.whenReady();
  const window = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    backgroundColor: "#101014",
    webPreferences: {
      preload: path.join(root, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  const { dpr, control } = await prepareWindow(window);
  let context: Omit<CursorStep, "kind" | "operation"> = {
    dpr,
    font: "bundled",
    padding: 0,
    lifecycle: "mount",
  };
  const execute = <T>(
    expression: string,
    operation: CursorStep["operation"] = "cursor",
  ): Promise<T> =>
    runCursorStep(window, { ...context, kind: "execute", operation }, () =>
      window.webContents.executeJavaScript(
        `globalThis.cursorFixture.${expression}`,
      ),
    );
  const captures: unknown[] = [];
  for (const [configured, padding] of [
    [false, 0],
    [false, 8],
    [true, 0],
    [true, 8],
  ] as const) {
    context = cursorContext(dpr, configured, padding, "mount");
    await execute(`mount(${configured}, ${padding})`, "mount");
    let initial: Phase | undefined;
    let previous: Phase | undefined;
    for (const lifecycle of ["initial", "zoom", "refit", "reload"] as const) {
      context = cursorContext(dpr, configured, padding, lifecycle);
      // Reload changes padding in place too, without changing creation-time family.
      const phase = await execute<Phase>(
        `phase(${JSON.stringify(lifecycle)}, ${lifecycle === "reload" ? 8 - padding : padding})`,
        "phase",
      );
      assert.equal(phase.starts, 1);
      assert.equal(phase.closes, 0);
      assert.equal(phase.sameCanvas, true);
      for (const dimension of ["x", "y", "width", "height"] as const)
        assert.ok(
          Math.abs(phase.canvas[dimension] - phase.available[dimension]) <= 1,
          `cursor canvas ${dimension} must fit available content`,
        );
      assert.equal(
        phase.padding,
        lifecycle === "reload" ? 8 - padding : padding,
      );
      if (lifecycle === "initial") initial = phase;
      if (lifecycle === "zoom") {
        assert.ok(phase.cellWidth > initial!.cellWidth);
        assert.ok(phase.cellHeight > initial!.cellHeight);
      }
      if (lifecycle === "refit")
        assert.ok(
          phase.canvas.width < previous!.canvas.width,
          `controlled content refit did not shrink canvas: ${phase.canvas.width} >= ${previous!.canvas.width}`,
        );
      if (lifecycle === "reload") {
        assert.equal(phase.cellWidth, initial!.cellWidth);
        assert.equal(phase.cellHeight, initial!.cellHeight);
        assert.ok(phase.canvas.width > previous!.canvas.width);
      }
      previous = phase;
      const capture = async (name: CursorStep["operation"]) => {
        const image = await runCursorStep(
          window,
          { ...context, kind: "capture", operation: name },
          async () => {
            const captured = await window.webContents.capturePage({
              x: Math.round(phase.canvas.x),
              y: Math.round(phase.canvas.y),
              width: Math.floor(phase.canvas.width),
              height: Math.floor(phase.canvas.height),
            });
            await holdControlledCapture(
              control,
              captures.length,
              name,
              captured,
            );
            return captured;
          },
        );
        if (process.env.OMXTERM_CURSOR_EVIDENCE_PATH) {
          await mkdir(process.env.OMXTERM_CURSOR_EVIDENCE_PATH, {
            recursive: true,
          });
          await writeFile(
            path.join(
              process.env.OMXTERM_CURSOR_EVIDENCE_PATH,
              `${phase.dpr}-${configured ? "configured" : "bundled"}-${padding}-${lifecycle}-${name}.png`,
            ),
            image.toPNG(),
          );
        }
        return { bitmap: image.toBitmap(), width: image.getSize().width };
      };
      await execute("cursor(6, 0, false)", "hidden");
      const blank = await capture("hidden");
      const controls = [];
      for (const [name, style, col] of [
        ["bar0", 6, 0],
        ["bar1", 6, 1],
        ["block0", 2, 0],
        ["underline0", 4, 0],
      ] as const) {
        await execute(`cursor(${style}, ${col}, true)`, name);
        const pixels = await capture(name);
        const bounds = ink(pixels.bitmap, blank.bitmap, pixels.width);
        captures.push({
          configured,
          initialPadding: padding,
          lifecycle,
          name,
          ...phase,
          ink: bounds,
        });
        assert.ok(
          bounds.count > 0,
          `${configured ? family : "bundled"} padding ${padding} ${lifecycle} DPR ${phase.dpr} ${name}: no visible cursor pixels`,
        );
        assert.ok(
          bounds.left >= col * phase.cellWidth,
          `${name}: ink before addressed cell`,
        );
        assert.ok(
          bounds.right < (col + 1) * phase.cellWidth,
          `${name}: ink after addressed cell`,
        );
        assert.ok(bounds.top >= 0 && bounds.bottom < phase.cellHeight);
        controls.push(bounds);
      }
      const [bar0, bar1, block, underline] = controls;
      assert.equal(
        bar0!.count,
        bar1!.count,
        "bar thickness must not be clipped in column zero",
      );
      assert.equal(bar0!.height, phase.cellHeight);
      assert.equal(bar0!.left, 0);
      assert.equal(bar1!.left, phase.cellWidth);
      assert.equal(block!.count, phase.cellWidth * phase.cellHeight);
      assert.equal(underline!.width, phase.cellWidth);
      if (lifecycle === "initial") {
        await execute("cursor(6, 0, true)", "bar0");
        await execute("blur()", "blur");
        const blurred = await capture("unfocused");
        const outline = ink(blurred.bitmap, blank.bitmap, blurred.width);
        assert.equal(outline.width, phase.cellWidth);
        assert.equal(outline.height, phase.cellHeight);
        assert.ok(
          outline.count > bar0!.count && outline.count < block!.count,
          "unfocused cursor remains a hollow block",
        );
        await execute("focus()", "focus");
        const focused = await capture("refocused");
        assert.deepEqual(
          ink(focused.bitmap, blank.bitmap, focused.width),
          bar0,
          "focus restores the selected bar style",
        );
        await execute("cursor(5, 0, true)", "blink");
        let visible = false,
          hidden = false;
        const deadline = Date.now() + 2000;
        while ((!visible || !hidden) && Date.now() < deadline) {
          await execute("focus()", "focus");
          const sample = await capture("blink");
          const count = ink(sample.bitmap, blank.bitmap, sample.width).count;
          assert.ok(
            count === 0 || count === bar0!.count,
            "blink paints either the full bar or no cursor",
          );
          visible ||= count > 0;
          hidden ||= count === 0;
        }
        assert.ok(
          visible && hidden,
          "blinking bar retains both native pixel phases",
        );
      }
    }
    context = { ...context, lifecycle: "dispose" };
    assert.deepEqual(await execute("dispose()", "dispose"), {
      starts: 1,
      closes: 1,
    });
  }
  process.stdout.write(
    "__OMXTERM_CURSOR_RESULT__" +
      JSON.stringify({
        family,
        webgl: app.getGPUFeatureStatus().webgl,
        captures,
      }) +
      "\n",
  );
  window.destroy();
  app.exit(0);
}
void run().catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
