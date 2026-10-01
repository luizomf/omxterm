// Electron 43.4.1 blink_converter.cc exposes the raw Blink modifier mask but
// omits AltGr from Input.modifiers. Chromium 150's kAltGrKey is 1 << 15.
// Neither Alt nor Ctrl+Alt establishes this identity. Keep pinned native mask
// knowledge here, shared by action delivery and Window Chrome bookkeeping.
const BLINK_ALTGR_KEY = 1 << 15;

export function hasNativeAltGr(input: object): boolean {
  return (
    "_modifiers" in input &&
    typeof input._modifiers === "number" &&
    (input._modifiers & BLINK_ALTGR_KEY) !== 0
  );
}
