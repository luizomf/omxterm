import { createRequire } from "node:module";

// Main-only capability. The caller supplies a fresh handle from its live owned
// BrowserWindow; the addon independently validates AppKit ownership. No handle
// is retained. null means unavailable without a private radius call; nonzero
// means failure. Reset still clears the native background when unavailable.
export interface MacOSWindowBlur {
  setBlur(handle: Buffer, enabled: boolean): number | null;
}

export function loadMacOSWindowBlur(): MacOSWindowBlur | undefined {
  try {
    const native: unknown = createRequire(import.meta.url)(
      "./macos-window-blur.node",
    );
    if (
      typeof native === "object" &&
      native !== null &&
      "setBlur" in native &&
      typeof native.setBlur === "function"
    )
      return native as MacOSWindowBlur;
  } catch {
    // Optional effect: missing/incompatible modules must never block startup.
  }
  return undefined;
}
