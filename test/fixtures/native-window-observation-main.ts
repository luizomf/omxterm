import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
} from "electron";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  NATIVE_RESPONSE_MS,
  NATIVE_SETUP_MS,
  NATIVE_WINDOW_PREFIX,
  type NativeWindowAction,
} from "./window-policy";

// Deliberately independent native recipes: no product factory, renderer, PTY,
// Chrome code or compositor introspection. Keep Windows nontransparent.
app.on("window-all-closed", () => {});
const root = __dirname;
const value = (name: string) => {
  const values = process.argv.filter((arg) => arg.startsWith(`--${name}=`));
  assert.equal(values.length, 1, "Missing or duplicate observation argument");
  return values[0]!.slice(name.length + 3);
};
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function bounded<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error("Independent native window setup/health timeout")),
          NATIVE_SETUP_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function live(window: BrowserWindow) {
  assert.equal(
    window.isDestroyed(),
    false,
    "Independent native window destroyed",
  );
  const bounds = window.getBounds();
  assert.ok(
    bounds.width > 0 && bounds.height > 0,
    "Independent native window has empty bounds",
  );
}
function presented(window: BrowserWindow) {
  live(window);
  assert.ok(
    window.isVisible() && !window.isMinimized() && !window.isFullScreen(),
    "Independent native window not presented",
  );
}
async function responsive(window: BrowserWindow) {
  live(window);
  assert.equal(
    await bounded(() =>
      window.webContents.executeJavaScript(
        "document.readyState === 'complete' && globalThis.fixtureResponsive === true",
      ),
    ),
    true,
    "Independent native renderer unhealthy",
  );
}

function rawWindowOptions(
  recipe: "framed" | "app",
): BrowserWindowConstructorOptions {
  return {
    width: 900,
    height: 600,
    show: false,
    frame: recipe === "framed" || process.platform === "darwin",
    transparent: recipe === "app" && process.platform !== "win32",
    useContentSize: recipe === "app" && process.platform !== "darwin",
    ...(recipe === "app" ? { minWidth: 320, minHeight: 200 } : {}),
    resizable: true,
    maximizable: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  };
}

async function run() {
  const id = value("observation-id");
  assert.match(id, /^[a-f0-9-]{36}$/);
  const kind = value("observation-kind");
  assert.ok(kind === "cursor" || kind === "chrome");
  const dpr = Number(
    app.commandLine.getSwitchValue("force-device-scale-factor"),
  );
  // Zero records the consumer's native default (Chrome has no DPR override).
  assert.ok(dpr === 0 || dpr === 1 || dpr === 2);
  const control = process.argv
    .find((arg) => arg.startsWith("--observation-control="))
    ?.split("=")[1];
  assert.ok(
    control === undefined ||
      [
        "missing-report",
        "duplicate-report",
        "error",
        "initial-hidden",
        "initial-maximized",
        "held-health",
        "nonzero-report",
      ].includes(control),
  );
  for (const name of ["userData", "sessionData"] as const) {
    await mkdir(path.join(root, name));
    app.setPath(name, path.join(root, name));
  }
  await bounded(() => app.whenReady());
  const controlMarker = () =>
    process.stdout.write(`__OMXTERM_NATIVE_WINDOW_CONTROL__${control}\n`);
  if (control === "error") {
    controlMarker();
    throw new Error("Controlled independent native observation error");
  }
  if (control === "missing-report") {
    controlMarker();
    app.quit();
    return;
  }
  const observations: NativeWindowAction[] = [];
  const recipes =
    kind === "cursor" ? (["framed"] as const) : (["framed", "app"] as const);
  for (const recipe of recipes) {
    const window = new BrowserWindow(rawWindowOptions(recipe));
    try {
      await bounded(() => window.loadFile(path.join(root, "index.html")));
      window.showInactive();
      const showDeadline = Date.now() + NATIVE_SETUP_MS;
      while (!window.isVisible() && Date.now() < showDeadline) await delay(10);
      assert.ok(window.isVisible(), "Independent native window show timeout");
      if (control === "initial-hidden") {
        window.hide();
        controlMarker();
      }
      // Rejection control for an already-maximized inspection, not evidence of
      // an actual transition on a compositor which cannot maximize.
      if (control === "initial-maximized") {
        window.isMaximized = () => true;
        controlMarker();
      }
      if (control === "held-health") {
        window.webContents.executeJavaScript = () =>
          new Promise<never>(() => {});
        controlMarker();
      }
      presented(window);
      assert.equal(
        window.isMaximized(),
        false,
        "Independent native window already maximized",
      );
      await responsive(window);
      async function observe(
        action: NativeWindowAction["action"],
        invoke: () => void,
        reached: () => boolean,
      ) {
        live(window);
        const start = Date.now();
        invoke();
        let observed = reached();
        while (!observed && Date.now() - start < NATIVE_RESPONSE_MS) {
          live(window);
          // Maximize must not become an unavailable result by hiding/minimizing
          // an otherwise broken window during the observation interval.
          if (action === "maximize") presented(window);
          await delay(25);
          observed = reached();
        }
        const elapsedMs = Date.now() - start;
        await responsive(window);
        observations.push({
          recipe,
          action,
          outcome: observed ? "observed" : "not-observed-within-budget",
          elapsedMs,
        });
        return observed;
      }
      if (kind === "cursor") {
        const minimized = await observe(
          "minimize",
          () => window.minimize(),
          () => window.isMinimized(),
        );
        if (minimized) {
          assert.equal(
            window.isMinimized(),
            true,
            "Independent native minimized state lost before restore",
          );
          assert.ok(
            await observe(
              "restore",
              () => window.restore(),
              () =>
                window.isVisible() &&
                !window.isMinimized() &&
                !window.isMaximized(),
            ),
            "Independent native minimize restoration failed",
          );
          presented(window);
        } else {
          presented(window);
          assert.equal(window.isMaximized(), false);
          assert.ok(
            await observe(
              "hide",
              () => window.hide(),
              () => !window.isVisible() && !window.isMinimized(),
            ),
            "Independent native hide not observed",
          );
        }
      } else {
        const maximized = await observe(
          "maximize",
          () => window.maximize(),
          () => window.isMaximized(),
        );
        presented(window);
        if (maximized) {
          assert.equal(
            window.isMaximized(),
            true,
            "Independent native maximized state lost before restore",
          );
          assert.ok(
            await observe(
              "restore",
              () => window.unmaximize(),
              () => !window.isMaximized(),
            ),
            "Independent native maximize restoration failed",
          );
          presented(window);
        }
      }
    } finally {
      window.destroy();
    }
  }
  const line = `${NATIVE_WINDOW_PREFIX}${JSON.stringify({ version: 1, id, kind, platform: process.platform, dpr, budgetMs: NATIVE_RESPONSE_MS, observations })}\n`;
  process.stdout.write(line);
  if (control === "duplicate-report") {
    controlMarker();
    process.stdout.write(line);
  }
  if (control === "nonzero-report") {
    controlMarker();
    app.exit(1);
  } else app.quit();
}
void run().catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
