import assert from "node:assert/strict";
import type { BrowserWindowConstructorOptions } from "electron";

// Independent fixture contract, not reused by the raw reference recipe.
export function assertNativeChromeConstruction(
  options: BrowserWindowConstructorOptions,
  platform: string,
): void {
  assert.equal(
    options.frame,
    platform === "darwin",
    "Native Chrome frame contract",
  );
  assert.equal(
    options.transparent,
    platform !== "win32",
    "Native Chrome transparency contract",
  );
  assert.equal(
    options.show,
    false,
    "Native Chrome initial presentation contract",
  );
  assert.notEqual(
    options.resizable,
    false,
    "Native Chrome must remain resizable",
  );
  assert.notEqual(
    options.maximizable,
    false,
    "Native Chrome must remain maximizable",
  );
  assert.equal(options.maxWidth, undefined, "Native Chrome maximum width trap");
  assert.equal(
    options.maxHeight,
    undefined,
    "Native Chrome maximum height trap",
  );
  assert.ok(
    (options.width ?? 0) > (options.minWidth ?? 0),
    "Native Chrome fixed width trap",
  );
  assert.ok(
    (options.height ?? 0) > (options.minHeight ?? 0),
    "Native Chrome fixed height trap",
  );
}
