import { mkdtemp, readFile, rm, lstat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { buildFixture } from "../fixtures/window-chrome-build";
import {
  FEATURE_SMOKE_FLAG,
  FEATURE_SMOKE_CASE,
  FEATURE_SMOKE_PHASES,
} from "../fixtures/feature-native-smoke-contract";

it("builds the maintained feature smoke and real shared renderer without launching Electron", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-feature-build-"));
  try {
    await buildFixture(root);
    for (const name of [
      "main.cjs",
      "preload.cjs",
      "renderer/index.js",
      "renderer/index.css",
      "renderer/index.html",
      "renderer/application-icon.png",
      "package.json",
    ])
      expect((await lstat(path.join(root, name))).isFile(), name).toBe(true);
    expect(await realpath(path.join(root, "node_modules"))).toBe(
      await realpath("node_modules"),
    );
    const main = await readFile(path.join(root, "main.cjs"), "utf8");
    expect(main).toContain(FEATURE_SMOKE_FLAG);
    for (const phase of FEATURE_SMOKE_PHASES)
      expect(main).toContain(`phase("${phase}")`);
    expect(main).toContain("__EXPLICIT_INPUT__right-native-smoke");
    expect(main).toContain("__EXPLICIT_INPUT__left-native-smoke");
    expect(main).toContain("featureLanguageRetained");
    const scenario = await readFile(
      "test/fixtures/feature-native-smoke.ts",
      "utf8",
    );
    expect(scenario).toContain("await evaluate(FEATURE_SMOKE_SPLIT_SCRIPT)");
    expect(main).toContain("stripChildren");
    expect(main).toContain("settings-xdg");
    expect(main).toContain("Settings horizontal overflow");
    expect(main).toContain(
      "Settings native synthetic keyboard traversal/focus cue failed",
    );
    expect(main).toContain("Settings changed native minimum bounds");
    expect(main).toContain("OMXTERM_SETTINGS_EVIDENCE_DIR");
    const css = await readFile(path.join(root, "renderer/index.css"), "utf8");
    expect(css).toContain("--ui-input-border");
    expect(css).toContain("@container (min-width: 760px)");
    expect(main).toContain("registerTerminalIpcRouter");
    expect(main).toContain("Promise.all(sessionExits)");

    // The real emitted entry stops at configuration. No fake pane, language
    // owner, GPU, native window or PTY is used to manufacture behavior coverage.
    const configuration = vi.fn(() => new Promise<never>(() => {}));
    const remove = vi.fn();
    const onTabCommand = vi.fn(() => remove);
    const addEventListener = vi.fn();
    const globals: Record<string, unknown> = {
      document: { querySelector: () => ({}) },
      omxterm: { terminal: { configuration, onTabCommand } },
      crypto: { randomUUID },
      addEventListener,
      TextEncoder,
      TextDecoder,
      atob,
      Uint8Array: class extends Uint8Array {
        static fromBase64(value: string) {
          return new Uint8Array(Buffer.from(value, "base64"));
        }
      },
    };
    globals.window = globals;
    runInNewContext(
      await readFile(path.join(root, "renderer/index.js"), "utf8"),
      globals,
    );
    expect(configuration).toHaveBeenCalledOnce();
    expect(onTabCommand).not.toHaveBeenCalled();
    const wait = globals.__windowChromeHostReady as () => Promise<void>;
    expect(wait).toBeTypeOf("function");
    let settled = false;
    const ready = wait().then(() => {
      settled = true;
    });
    // An independent transport observer is not the actual host subscription.
    onTabCommand();
    await Promise.resolve();
    expect(settled).toBe(false);
    const rejected = expect(ready).rejects.toThrow("unavailable");
    expect(addEventListener).toHaveBeenCalledExactlyOnceWith(
      "pagehide",
      expect.any(Function),
      { once: true },
    );
    (addEventListener.mock.calls[0]![1] as () => void)();
    await rejected;
    expect(settled).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

it("keeps one literal feature-smoke case and the four qualified legacy case names", async () => {
  const source = await readFile(
    "test/integration/window-chrome.test.ts",
    "utf8",
  );
  expect(source.match(/it\(\s*FEATURE_SMOKE_CASE/gu)).toHaveLength(1);
  expect(source).toContain(
    '["continuity", "fail-fast", "about-only", "settings-only"]',
  );
  expect(source).toContain('mode === "feature-smoke"');
  expect(FEATURE_SMOKE_CASE).toBe(
    "checks pane geometry and live language drafts without leaking a native dialog or process",
  );
});
